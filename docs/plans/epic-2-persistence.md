# Epic 2 — Persistence: search history + TTL weather cache (PostgreSQL)

Implementation plan for the data-persistence features: a server-side weather cache with TTL and per-user search history with protected endpoints. Self-contained brief; read `docs/plans/epic-1-weather-vertical-slice.md` for how Epic 1 was structured — this epic builds directly on that code.

## Repo context (delta since Epic 1)

- Epic 1 landed: `apps/server/src/app.ts` exposes a `buildApp()` factory; weather module lives in `apps/server/src/modules/weather/` (`openweather.client.ts`, `weather.service.ts`, `weather.schemas.ts`, `weather.routes.ts`); shared error handling in `apps/server/src/lib/errors.ts` with the `{ error: { code, message } }` envelope. Frontend has TanStack Query, `src/lib/api.ts`, `src/hooks/use-weather.ts`, and `src/components/weather/*`.
- Auth is Better-Auth (`packages/auth`), already fully working (email/password, session cookie, `httpOnly`/`sameSite=lax`, first-party via the BFF proxy). Web has `authClient` (`apps/web/src/lib/auth-client.ts`) with `useSession`. The server currently only uses auth for the `/api/auth/*` handler and evlog user identification — there is **no route guard yet**; this epic adds one.
- Database: PostgreSQL via Prisma (`packages/db`), schema split across `packages/db/prisma/schema/*.prisma` (auth models in `auth.prisma`). Migrations: `pnpm nx db:migrate @weather-app/db` (runs `prisma migrate dev`; it reads `apps/server/.env` via `prisma.config.ts`). Local Postgres: `pnpm run db:start`.
- Pre-commit runs Biome + the full test suite; keep everything green.

## Decision already made (record it, don't revisit)

**PostgreSQL for the cache, not Redis.** One datastore at this scale; the cache sits behind a small store interface so a Redis implementation is a drop-in swap later (this is already stated in ARCHITECTURE.md — the implementation must actually honour it).

## Scope

**In**: Prisma models + migration for `WeatherCache` and `SearchHistory`; cache-through in the weather service (geocode + current weather) with TTLs and stale-on-upstream-failure; auth guard for protected routes; history endpoints (list, delete); frontend history panel with loading/empty/error states and click-to-rerun; tests for all of it; docs updates.

**Out** (later epics — do not build): rate limiting, helmet, favourites, forecast, pagination beyond the fixed history cap, Redis, optimistic UI (note as stretch only if everything else is done).

## Step 1 — Schema and migration

Add a new file `packages/db/prisma/schema/app.prisma`:

```prisma
model WeatherCache {
  key       String   @id
  payload   Json
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([expiresAt])
  @@map("weather_cache")
}

model SearchHistory {
  id           String   @id @default(cuid())
  userId       String
  query        String
  resolvedName String
  country      String
  state        String?
  lat          Float
  lon          Float
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@map("search_history")
}
```

Add the corresponding `searchHistory SearchHistory[]` relation to the `User` model in `auth.prisma`. Run `pnpm nx db:migrate @weather-app/db` with a migration name like `add_weather_cache_and_search_history`. Local Postgres must be running (`pnpm run db:start`).

## Step 2 — Cache store (behind an interface)

`apps/server/src/lib/cache.ts`:

```ts
interface CacheStore {
  get<T>(key: string): Promise<T | null>;          // null if missing or expired
  getStale<T>(key: string): Promise<T | null>;     // returns even if expired (for upstream-failure fallback)
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}
```

- `PrismaCacheStore` implements it on the `WeatherCache` table: `set` = upsert with computed `expiresAt`; `get` = read, return null (and lazily delete the row) when `expiresAt < now()`; `getStale` = read ignoring expiry.
- Cache failures must never break requests: wrap store calls so a thrown cache error is logged and treated as a miss (the weather flow proceeds to upstream).
- Cleanup of expired rows is lazy (on read) — note a periodic sweep as a future improvement in the docs, don't build one.

## Step 3 — Cache-through in the weather service

Wire the store into `weather.service.ts` (injected — see Step 6):

- **Geocode cache**: key `geo:v1:{query.trim().toLowerCase()}`, TTL 24 h (places don't move).
- **Current weather cache**: key `wx:v1:{lat.toFixed(2)}:{lon.toFixed(2)}` (~1 km granularity so nearby queries share entries), TTL 10 min. Cache the mapped DTO, not the raw upstream body.
- TTLs as named constants in one place (e.g. `weather.constants.ts`).
- **Stale-on-failure**: if upstream fails (502/504 paths) and `getStale` has an entry for the weather key, return it instead of the error. This matches the assumption already documented in ARCHITECTURE.md.
- Surface cache behaviour via a response header on `/api/v1/weather`: `x-cache: HIT | MISS | STALE`. Keeps the DTO stable and makes tests/demos trivial.

## Step 4 — Auth guard + history endpoints

`apps/server/src/lib/auth-guard.ts`:
- `requireSession` preHandler: resolve the Better-Auth session from request headers via `auth.api.getSession({ headers })` (convert Fastify's headers to a `Headers` instance — same conversion the existing `/api/auth/*` handler does). No session → **401** `UNAUTHENTICATED` in the standard envelope. Attach `userId` to the request (declaration-merge a typed property; follow whatever pattern is cleanest with the existing types).
- Also export an optional variant (`getOptionalSession`) that resolves the session if present but never rejects — needed by the weather route.
- Make the session resolution injectable (see Step 6) so route tests don't need real Better-Auth sessions.

`apps/server/src/modules/history/` (`history.routes.ts`, `history.service.ts`, `history.schemas.ts`), registered under `/api/v1`:

- `GET /api/v1/history` (guarded): the user's most recent searches, newest first, fixed limit 10. Response items: `{ id, query, resolvedName, country, state, lat, lon, createdAt }`.
- `DELETE /api/v1/history/:id` (guarded): delete **only if the row belongs to the session user** — filter the delete by `{ id, userId }`; zero rows affected → 404 `NOT_FOUND` (do not reveal whether the id exists for another user). Success → 204.

**Recording**: in the weather route, after a successful (200) weather fetch, if an optional session is present, record the search — `query` (raw input, trimmed), the resolved location fields, and coordinates. Rules:
- **Consecutive dedupe**: if the user's most recent entry has the same `lat`/`lon`, update its `createdAt` and `query` instead of inserting a new row.
- **Cap**: after insert, delete the user's rows beyond the newest 50.
- Recording failures must not fail the weather response — log and continue.
- Anonymous searches are never recorded.

Error-code table additions (extend the Epic 1 table in code and docs): 401 `UNAUTHENTICATED`, 404 `NOT_FOUND` (generic resource; `LOCATION_NOT_FOUND` stays weather-specific).

## Step 5 — Frontend history panel

- `src/lib/api.ts`: add `getHistory()` and `deleteHistoryItem(id)` (same `ApiError` handling; 401 should not toast/redirect — the panel simply isn't rendered when signed out, so a 401 here is an edge case treated as an error state).
- `src/hooks/use-history.ts`: `useQuery({ queryKey: ["history"], queryFn: getHistory, enabled: isSignedIn })`; a `useMutation` for delete that invalidates `["history"]` on success.
- After a successful weather fetch **while signed in**, invalidate `["history"]` so the panel updates (do this where the weather query succeeds — e.g. via the query's success handling in the search component/hook, not inside presentational components).
- `src/components/weather/search-history.tsx` (client, rendered on the home page below/beside the search):
  - **Signed out**: render a single subtle line — "Sign in to keep your search history" linking to `/login`. No panel.
  - **Signed in**: card titled "Recent searches" with states: loading (2–3 skeleton rows), error (short message + retry), empty ("Your searches will appear here"), list (each row: resolved name + country, relative or short time, delete button with `aria-label`). Clicking a row re-runs that search — lift the "current search" state so the history panel can set the same state the form sets (the resolved name is fine as the query input).
  - Keep it presentational + hook split, consistent with Epic 1. Use `@weather-app/ui` primitives (`card`, `button`, `skeleton`, `empty`).
- Session state comes from `authClient.useSession()`.
- Responsive: panel stacks under the search results on mobile, sits beside/below cleanly at desktop widths.

## Step 6 — Testability (dependency injection, no live DB in route tests)

Extend the `buildApp()` options with injectable deps, defaulting to the real implementations:

```ts
buildApp({ cacheStore?, historyRepo?, getSession?, weatherTimeoutMs?, ... })
```

- `historyRepo`: extract the Prisma calls behind a small repository interface (`listForUser`, `deleteOwned`, `record` with dedupe+cap logic either in repo or service — pick one and be consistent).
- Route/integration tests inject **in-memory fakes** for `cacheStore` and `historyRepo`, and a stubbed `getSession` returning a fixed user (or null). OpenWeather stays mocked via undici `MockAgent` exactly as in Epic 1. **No test may require a running Postgres or real session.**
- The Prisma implementations (`PrismaCacheStore`, Prisma history repo) get their logic covered where it lives: TTL/expiry computation, dedupe, and cap logic should be written so the decision logic is unit-testable without a DB (pure functions or fakes). Direct Prisma-against-real-DB integration tests are **out of scope** — note this honestly in REQUIREMENTS/ARCHITECTURE as a gap that CI with a service container would close.

Test cases (add to the existing Vitest suites):

Server:
- Weather + cache: first call MISS (upstream hit, cache populated), second call HIT (no upstream call — assert via MockAgent call counts), expired entry → MISS + refetch; upstream 5xx with stale entry → 200 with `x-cache: STALE`; upstream 5xx without stale → 502 as before.
- Cache store fakes: TTL boundary (expired exactly at now), cache errors treated as miss.
- History: 401 without session on both endpoints; list returns only the session user's rows, newest first, capped at 10; delete own row → 204 and gone; delete another user's row → 404; successful weather search records history for signed-in user; anonymous search records nothing; consecutive duplicate search dedupes (updates timestamp, no new row); 51st distinct search evicts the oldest.

Web:
- Signed out: sign-in hint rendered, no history fetch (`enabled: false`).
- Signed in: loading → list; empty state; error + retry; delete removes item (invalidation → refetched list); clicking a history row triggers a weather search for that location.

## Step 7 — Docs updates (same PR)

- `REQUIREMENTS.md`: M8 (persistence) → Done; S3 (protected endpoints), S4 (search history), S5 (TTL cache) → Done. If Prisma-layer DB integration tests were skipped per Step 6, keep M12's caveat honest.
- `ARCHITECTURE.md`: in Data and persistence, change the "planned" wording to implemented and document the concrete strategy: cache keys and granularity, TTL values (10 min weather / 24 h geocode), lazy expiry + stale-on-failure, invalidation story (TTL-based; keys are versioned `v1` so a mapping change can bust the cache by bumping the version), history dedupe + 50-entry cap, and the `CacheStore` interface as the Redis swap seam. Update the system-overview diagram (weather routes ↔ Postgres now real).
- `README.md`: no new env vars expected; add anything that changed (e.g. mention that history requires signing in).

## Acceptance checklist

- [ ] Migration applies cleanly on a fresh DB (`pnpm run db:start` + `pnpm nx db:migrate @weather-app/db`).
- [ ] `pnpm nx run-many -t check-types`, `pnpm run check`, and all tests pass (pre-commit will enforce this).
- [ ] Dev run: search twice → second response has `x-cache: HIT`; sign in, search, see the entry appear in Recent searches; click it → weather re-runs; delete it → gone; sign out → panel replaced by the sign-in hint.
- [ ] `/api/v1/history` without a session returns 401 in the standard envelope; deleting another user's row returns 404.
- [ ] Killing the upstream (or mocking failure) with a warm-but-expired cache serves stale data with `x-cache: STALE`.
- [ ] No test requires a live Postgres, real OpenWeather, or a real session.
- [ ] Error envelope shape unchanged and consistent across all new endpoints.

## Watch out for

- **Better-Auth session lookup** hits the DB per guarded request — fine here; do not add session caching (out of scope, and it complicates logout).
- The Fastify request → `Headers` conversion already exists in the `/api/auth/*` handler in `app.ts` — extract and reuse it rather than writing a second variant.
- `JSON` Prisma column: the payload is the mapped DTO; parse it back through the DTO zod schema on cache read so a stale/corrupt payload degrades to a cache miss, not a 500.
- Keep the history recording and cache writes **out of the response critical path's error flow** — failures there log and continue; the user still gets their weather.
- Biome + pre-commit: run `pnpm run check` before committing; the full test suite runs on commit.
- Don't regenerate or hand-edit anything in `packages/db/prisma/generated/` — it's produced by `prisma generate` (which `db:migrate` triggers).
