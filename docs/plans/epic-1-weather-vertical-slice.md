# Epic 1 — Weather vertical slice (OpenWeather)

Implementation plan for the core weather feature: search a location, see current weather, with proper loading / not-found / error handling end-to-end. This is a self-contained brief; everything needed is described here or discoverable in the repo.

## Repo context

- pnpm + Nx monorepo. Apps: `apps/web` (Next.js 16, App Router, React Compiler enabled, typedRoutes), `apps/server` (Fastify 5). Shared packages: `packages/env` (zod-validated env via @t3-oss/env), `packages/ui` (shadcn/ui primitives, import as `@weather-app/ui/components/<name>`), `packages/db` (Prisma — **not needed in this epic**), `packages/auth` (Better-Auth — not needed here; weather search is public, no auth on these endpoints).
- **BFF proxy**: the browser only calls relative `/api/*` paths on the web app's origin; `apps/web/next.config.ts` rewrites `/api/:path*` to the Fastify server (`INTERNAL_SERVER_URL`). So the frontend fetches `/api/v1/...` with no host and no CORS concerns. Do not introduce a `NEXT_PUBLIC_*` server URL.
- Logging: evlog is already wired on both apps (see `apps/server/src/index.ts`). Use the request logger for error logging; do not add another logging library.
- Lint/format: Biome (`pnpm run check`), runs on pre-commit via husky/lint-staged. Type-check: `pnpm nx run-many -t check-types`. Dev: `pnpm nx dev server` / `pnpm nx dev web` (web :3001, server :3000).
- See `ARCHITECTURE.md` and `REQUIREMENTS.md` for the wider context. This epic covers requirements M1–M5, M9, M10, M12, M13 (partially), and S6.

## Provider decision (already made — record it, don't revisit)

**OpenWeather** (openweathermap.org): clearer API docs than alternatives, large community and existing support. Requires an API key.

APIs used (both on the free tier):
- Geocoding: `GET https://api.openweathermap.org/geo/1.0/direct?q={query}&limit={n}&appid={key}` → array of `{ name, lat, lon, country, state? }`. Empty array = location not found.
- Current weather: `GET https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&units=metric&appid={key}` → `{ main: { temp, feels_like, humidity }, weather: [{ id, main, description, icon }], wind: { speed }, dt, name }`.

## Scope

**In**: one API endpoint (geocode + current weather combined), zod validation, consistent error envelope with correct status codes, frontend search + weather card with loading/empty/not-found/error states, TanStack Query, Vitest setup with unit + integration tests, docs updates.

**Out** (later epics — do not build): rate limiting, helmet/security headers, search history, caching (server or beyond React Query defaults), favourites, forecast, autosuggest/typeahead, CI, OpenAPI docs.

## Step 0 — Environment

1. Add `OPENWEATHER_API_KEY: z.string().min(1)` to the server schema in `packages/env/src/server.ts`.
2. Add it to `apps/server/.env` (the user has a key; use a placeholder and tell them where to paste it if absent).
3. Update README's Environment Variables section: add the variable with a link to https://home.openweathermap.org/api_keys and a note that new OpenWeather keys can take a little while to activate.

## Step 1 — Backend

Install in `apps/server`: `fastify-type-provider-zod` (zod is already a dependency via catalog — it is **zod v4**; verify the fastify-type-provider-zod version installed supports zod 4 before writing code against it).

Structure (new files under `apps/server/src/`):

```
lib/errors.ts                        AppError + error codes + shared fastify error handler
modules/weather/openweather.client.ts  HTTP client for the two OpenWeather endpoints
modules/weather/weather.service.ts      orchestration + DTO mapping
modules/weather/weather.schemas.ts      zod schemas: query params, response DTO, error envelope
modules/weather/weather.routes.ts       fastify plugin
```

Register in `index.ts`: set the zod validator/serializer compilers, register the weather plugin under prefix `/api/v1`, and register the shared error handler. Keep the existing auth route and CORS untouched.

### Endpoint

`GET /api/v1/weather?location={free text}`

- Query schema: `location` — string, trimmed, min 1, max 100.
- Flow: geocode `location` (limit 1) → if empty, 404 → else fetch current weather for the coordinates → map to DTO → 200.
- Response DTO (do not leak upstream shapes to the client):

```jsonc
{
  "location": { "name": "London", "country": "GB", "state": "England", "lat": 51.5, "lon": -0.12 },
  "current": {
    "temperatureC": 18.2,
    "feelsLikeC": 17.4,
    "humidityPct": 62,
    "windSpeedMs": 4.1,
    "condition": { "id": 803, "main": "Clouds", "description": "broken clouds", "icon": "04d" },
    "observedAt": "2026-07-04T10:20:00.000Z"   // from upstream `dt`
  }
}
```

### Error handling (core requirement — get this exactly right)

Consistent envelope for every non-2xx response: `{ "error": { "code": string, "message": string } }`.

| Case | Status | Code |
|------|--------|------|
| Query validation failure (missing/empty/too-long `location`) | 400 | `VALIDATION_ERROR` |
| Geocode returns no results | 404 | `LOCATION_NOT_FOUND` |
| Upstream 5xx / unexpected response shape / upstream 429 | 502 | `UPSTREAM_ERROR` |
| Upstream timeout | 504 | `UPSTREAM_TIMEOUT` |
| Anything unhandled | 500 | `INTERNAL_ERROR` |

Implementation notes:
- `lib/errors.ts`: a small `AppError` class carrying `statusCode` + `code` + safe message; `setErrorHandler` maps `AppError` → envelope, zod/validation errors → 400 envelope (include field-level details in the message or a `details` array), everything else → 500 with a generic message.
- Log the full underlying error (via the request logger) but **never** put upstream URLs, API keys, or raw upstream bodies in client-facing messages. Upstream 401 means a misconfigured key: log at error level, return 502 with the generic upstream message.
- Client: use global `fetch` with `AbortSignal.timeout(5000)` (make the timeout injectable for tests). Validate upstream responses with lenient zod schemas (only the fields we map) so shape drift fails loudly as `UPSTREAM_ERROR` rather than sending garbage downstream.
- Do not fetch OpenWeather with the key in a way that logs the URL (evlog logs requests to *this* server, which is fine — just don't `log.info({ url })` the upstream URL yourself).

## Step 2 — Frontend

Install in `apps/web`: `@tanstack/react-query`.

### Data layer (separated from presentation — this is graded)

- `src/lib/api.ts`: typed fetch wrapper. `getWeather(location: string): Promise<WeatherResponse>` calling `/api/v1/weather?location=...` (relative URL — the BFF rewrite handles routing). On non-2xx, parse the error envelope and throw a typed `ApiError { status, code, message }`. Share the response type with the card components.
- `src/components/providers.tsx`: add `QueryClientProvider` around the existing tree (file is already a client component). Query defaults: `staleTime` ~2 minutes; custom `retry` — never retry 4xx (`ApiError.status < 500`), retry network/5xx once or twice.
- `src/hooks/use-weather.ts`: `useQuery({ queryKey: ["weather", location.toLowerCase().trim()], queryFn, enabled: location !== "" })`.

### UI

Home page (`src/app/page.tsx`): replace the scaffold ASCII-art content entirely. Make the page a thin server component rendering a client `<WeatherSearch />` island.

Components under `src/components/weather/` — presentational components take the DTO as props and do no fetching:

- `weather-search.tsx` (client): form with a labelled input + submit button. Submitting sets the searched location (component state). While the query is fetching: disable the button and show an inline spinner on it.
- `weather-card.tsx`: current conditions — resolved location name (+ country/state), temperature, feels-like, condition description with the OpenWeather icon (`https://openweathermap.org/img/wn/{icon}@2x.png` — use a plain `<img>` with alt text, or add `images.remotePatterns` to next.config if using `next/image`), wind speed, humidity. Use `@weather-app/ui/components/card`.
- `weather-skeleton.tsx`: skeleton mirroring the card layout (`@weather-app/ui/components/skeleton`).

### Result states (all four must be visibly distinct — explicit requirement)

Render exactly one of these in an `aria-live="polite"` region below the form:

1. **Initial/empty** (nothing searched yet): use `@weather-app/ui/components/empty` — short prompt to search for a city.
2. **Loading**: the skeleton card (plus the disabled/spinner button state above).
3. **Not found** (`ApiError.code === "LOCATION_NOT_FOUND"` / status 404): friendly message echoing the query — "We couldn't find ‘{query}'. Check the spelling or try a nearby city." This is a normal outcome, not an error — style it neutrally, no red.
4. **Error** (anything else — network, 4xx validation, 5xx): error styling with a generic "Something went wrong fetching the weather." and a **Retry** button wired to the query's `refetch()`.
5. **Success**: the weather card.

Responsive: single column, `max-w` container, sensible at 375px / 768px / 1280px. Keep the existing header/theme toggle as is.

## Step 3 — Tests (part of this epic, not a follow-up)

Set up **Vitest** in both apps (add `"test": "vitest run"` script to each app's package.json so Nx infers a `test` target; add a root alias `"test": "nx run-many -t test"`).

Server (`apps/server`, node environment):
- Mock OpenWeather at the HTTP layer with undici's `MockAgent` + `setGlobalDispatcher` (Node's global fetch goes through undici, so this intercepts it — set it up before building the app instance, reset between tests). **No test may hit the real OpenWeather API.**
- Build the fastify instance in a factory so tests can `app.inject()` without listening on a port (refactor `index.ts` into `buildApp()` + a listen entrypoint if needed).
- Cases: 200 happy path (fixture geocode + weather JSON → assert full DTO mapping incl. metric units and `observedAt`); 400 missing and over-long `location`; 404 on empty geocode array; 502 on upstream 500 and on malformed upstream body; 504 on timeout (inject a tiny client timeout and delay the mock). Assert the error envelope shape on every non-2xx.
- Unit tests for the DTO mapping function in isolation.

Web (`apps/web`, jsdom + @testing-library/react):
- `weather-card` renders all fields from a DTO fixture.
- Search flow with a mocked `getWeather` (mock the api module, not React Query): loading state appears, success renders card, 404 renders the not-found message containing the query, error renders retry and clicking retry refetches.

## Step 4 — Docs updates (same PR)

- `README.md`: `OPENWEATHER_API_KEY` in the env section (step 0); add the test command to the Common Commands table.
- `REQUIREMENTS.md`: flip statuses — M1–M5, M9, M10 → Done; M12/M13 → Done or "🚧 In progress" honestly reflecting coverage; S6 (API versioning) → Done (`/api/v1`).
- `ARCHITECTURE.md`: remove the "planned" markers on the weather routes/external API in the diagram and Data-and-persistence section (leave the cache/history lines as planned — that's Epic 2); add a short "Weather provider" decision: OpenWeather chosen for clearer API documentation and a larger community/support ecosystem; trade-off vs Open-Meteo is API-key management (key lives server-side only, per the BFF section). Add table rows for OpenWeather and TanStack Query with brief justifications.

## Acceptance checklist

- [ ] `pnpm nx run-many -t check-types` and `pnpm run check` pass; all tests pass.
- [ ] Dev run: searching "London" shows correct current weather; searching gibberish shows the not-found state; stopping the server mid-session and retrying shows the error state with a working Retry.
- [ ] The API key appears nowhere in `apps/web` source or the client bundle (grep the repo and `.next` output for the key/`appid`).
- [ ] All four frontend result states reachable and visually distinct; input labelled; results region `aria-live`.
- [ ] Error envelope identical in shape across 400/404/502/504.
- [ ] No new `NEXT_PUBLIC_*` variables; frontend only calls relative `/api/v1/...`.

## Watch out for

- **zod v4** across the workspace — check fastify-type-provider-zod compatibility before coding; if incompatible, validate manually in a `preValidation` hook instead and keep the same error mapping.
- React Compiler is on — write plain idiomatic components, no manual memo games.
- `typedRoutes` is on — `Link` hrefs are type-checked.
- Biome runs on pre-commit; run `pnpm run check` before committing to avoid hook surprises.
- The Next rewrite only exists when `INTERNAL_SERVER_URL` is set — both dev servers must run (`pnpm nx run-many -t dev`) for the frontend to reach the API.
- New OpenWeather keys can take ~10–60 min to activate; a 401 from upstream right after key creation is expected — the 502 mapping plus an error-level log line should make this obvious, not mysterious.
