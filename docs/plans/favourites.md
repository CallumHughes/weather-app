# Task — Favourite locations

Implementation plan for per-user favourite locations (REQUIREMENTS C4): save a location from a weather result, list favourites, remove them. The model carries an explicit sort order **for future manual reordering, which is a separate task** — this task only lays the ordering foundation.

## Repo context

- Follow the history module as the template throughout — it is the closest prior art: `apps/server/src/modules/history/` (`routes` + `service` + `repo` + `schemas`, guard via `requireSession`, ownership-filtered deletes → 404, in-memory fake repo injected through `buildApp()` opts for tests). Frontend prior art: `apps/web/src/hooks/use-history.ts` and `src/components/weather/search-history.tsx` (panel states, click-to-rerun via lifted search state, delete with invalidation).
- Prisma app models live in `packages/db/prisma/schema/app.prisma`; migrations via `pnpm nx db:migrate @weather-app/db` (local Postgres: `pnpm run db:start`).
- OpenAPI: routes must carry zod schemas + tags/summaries/`responseDocs` like the existing modules; after adding routes run `pnpm run docs:generate` — the spec drift test (`apps/server/src/openapi.test.ts`) fails pre-commit otherwise, and it asserts the exact public path count (update that assertion).
- Error envelope + codes: `apps/server/src/lib/errors.ts`.

## Ordering semantics (the decision this task must honour)

- `sortOrder Int?` — nullable. **No saved order exists until the user manually reorders** (future task).
- List ordering: `sortOrder ASC NULLS LAST`, then `createdAt ASC`. So before any reorder everything is null → pure `createdAt` order; after a future partial reorder, ordered rows come first and newly added favourites (null) append at the end in creation order. Prisma supports this via `orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]`.
- This task never writes `sortOrder` — it exists in the model, the list respects it, and the future reorder endpoint (e.g. `PUT /api/v1/favourites/order` writing dense integers) plugs in without a migration. Note that seam in the code and ARCHITECTURE.

**Decision — `sortOrder` column, not an ordered array of favourite IDs on the user** (considered and rejected): an array splits one entity across two sources of truth. Postgres cannot enforce FK integrity on array elements, so deletes leave dangling IDs unless every delete also rewrites the array transactionally; every list read becomes reconciliation code (sort by array position, drop dangling IDs, append unordered rows) instead of one indexed `ORDER BY sortOrder NULLS LAST, createdAt`; and concurrent reorders are whole-array last-write-wins. The column keeps order on the row, deleted with the row, with all invariants DB-enforced. Conceded trade-off: a full reorder writes up to N rows instead of one array value — trivial under the 20-favourite cap, and the future reorder task can use gapped/fractional values for one-row moves.

**Decision — store the resolved location (`name`/`country`/`state` + `lat`/`lon`), no provider ID**: OpenWeather's geocoding API returns no stable ID (its legacy city IDs are deprecated request surface) — coordinates are the identity, and they're provider-neutral. The display fields are deliberate denormalisation so the favourites list renders with zero upstream calls (an ID-only design would need a reverse-geocode per favourite per render); same pattern as `SearchHistory`.

## Step 1 — Schema and migration

Add to `packages/db/prisma/schema/app.prisma` (+ `favourites FavouriteLocation[]` relation on `User` in `auth.prisma`):

```prisma
model FavouriteLocation {
  id        String   @id @default(cuid())
  userId    String
  name      String
  country   String
  state     String?
  lat       Float
  lon       Float
  sortOrder Int?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, lat, lon])
  @@index([userId, sortOrder, createdAt])
  @@map("favourite_location")
}
```

The `@@unique([userId, lat, lon])` prevents duplicate favourites; coordinates come from the weather DTO's resolved location (geocode results are cached 24 h, so the same city yields identical coordinates).

## Step 2 — API (`apps/server/src/modules/favourites/`)

All guarded with `requireSession`, registered under `/api/v1`, tagged `Favourites` in the OpenAPI config:

- `GET /api/v1/favourites` → the user's favourites in the order defined above. Response items: `{ id, name, country, state, lat, lon, sortOrder, createdAt }`.
- `POST /api/v1/favourites` — body is the resolved location `{ name, country, state?, lat, lon }`; **reuse/share the location field schemas with the weather DTO** rather than redefining them. 201 with the created row. Duplicate (same user + lat/lon) → 409 `ALREADY_FAVOURITE`. Cap of 20 favourites per user → 400 `FAVOURITES_LIMIT_REACHED` (constants next to the history cap).
- `DELETE /api/v1/favourites/:id` → delete filtered by `{ id, userId }`; zero rows → 404 `NOT_FOUND`; success 204.

Add `ALREADY_FAVOURITE` and `FAVOURITES_LIMIT_REACHED` to `ErrorCodes`. Repo interface (`listForUser`, `create`, `deleteOwned`, `countForUser` — or fold count into create) mirrors the history repo; `buildApp()` gains an injectable `favouritesRepo` defaulting to the Prisma implementation; add an in-memory fake to `src/test/fakes.ts`.

## Step 3 — Frontend

- `src/lib/api.ts`: `getFavourites()`, `addFavourite(location)`, `deleteFavourite(id)` with the existing `ApiError` handling.
- `src/hooks/use-favourites.ts`: list query (`enabled` when signed in), add/remove mutations invalidating `["favourites"]`. Treat a 409 on add as success-shaped (invalidate and move on — the state was just stale).
- **Star toggle on the weather result**: when signed in and a weather result is shown, a star button favourites/unfavourites the resolved location (derive `isFavourite` by matching lat/lon against the favourites list). Keep `weather-card` presentational — pass `isFavourite`/`onToggleFavourite` props from the container (`weather-home`), or render the star adjacent to the card from the container. `aria-pressed` + `aria-label` on the toggle.
- **Favourites panel** (`src/components/weather/favourites.tsx`): card titled "Favourites" next to Recent searches — same state set (loading skeletons / error + retry / empty "Star a location to save it here" / list). Rows: name + country, click re-runs the search (same lifted state mechanism as history), remove button with `aria-label`. Signed out: render nothing — the history panel's sign-in hint already covers the signed-out story; don't duplicate it.
- Layout: panels stack on mobile, sit side by side at desktop widths (adjust the existing panel layout in `weather-home` as needed).

## Step 4 — Tests

Server (fakes, no DB — as ever):
- 401 on all three endpoints without a session.
- List: only the session user's rows; ordering — all-null `sortOrder` → `createdAt` order; mixed `sortOrder` (seed the fake directly) → ordered rows first, nulls last by `createdAt`.
- Create: 201 + echo; duplicate lat/lon → 409 `ALREADY_FAVOURITE`; 21st favourite → 400 `FAVOURITES_LIMIT_REACHED`; invalid body → 400 `VALIDATION_ERROR`.
- Delete: own row → 204; foreign/unknown id → 404.
- Spec drift test: update the expected path count/list; regenerate.

Web:
- Panel: signed-out renders nothing (and no fetch); loading → list; empty state; error + retry; remove invalidates; click row re-runs search.
- Star toggle: shown only signed-in with a result; reflects `isFavourite`; add and remove flows call the right mutation.

## Step 5 — Docs (same PR)

- `pnpm run docs:generate` — favourites endpoints appear in the API reference; add the `Favourites` tag description in `apps/server/src/lib/openapi.ts`.
- `REQUIREMENTS.md`: C4 → Done.
- `ARCHITECTURE.md`: extend the Data-and-persistence section — favourites model, the `sortOrder NULLS LAST, createdAt` ordering contract, the 20-cap, and the reorder-endpoint seam as the follow-up task. Record both decisions from "Ordering semantics" above (sortOrder column over an ordered-ID array; resolved location over a provider ID) in the doc's why/trade-off style.
- Root README: nothing expected; fumadocs content regenerates.

## Acceptance checklist

- [ ] Migration applies cleanly; `check-types`, Biome, full suite green (pre-commit enforces).
- [ ] Live: sign in → search → star → appears in Favourites; star again shows unfavourite and removes; click favourite re-runs search; second add of same place is a no-op at the UI level; signed out → no favourites UI, no fetch.
- [ ] Ordering: with no manual order, list follows `createdAt`; seeding mixed `sortOrder` in a test proves ordered-first/nulls-last.
- [ ] 401/404/409/400-cap all return the standard envelope; spec regenerated and drift test green.
- [ ] History behaviour untouched (its suites unchanged and passing).

## Watch out for

- Float equality for the unique key is fine *because* coordinates come from the cached geocode — do not round or normalise them differently in favourites vs weather, or duplicates will slip through.
- Prisma's nulls-last `orderBy` syntax requires a recent Prisma (v7 here — fine), but verify the generated client accepts it before building logic on it.
- Don't let the star toggle trigger a favourites refetch storm — one invalidation per mutation.
- The drift test asserts exact path counts — update it deliberately, don't loosen it.
