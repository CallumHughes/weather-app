# Requirements

Requirements derived from the tech assignment brief, prioritised using MoSCoW. Status reflects the current state of the codebase.

Persistence choice: the brief requires at least one of search history / favourite locations / cached weather data. This project implements **search history** and **server-side cached weather data** (favourites is a could-have).

## Must have

Core functionality and the items the brief lists as required.

| # | Requirement | Status |
|---|-------------|--------|
| M1 | Users can search for a location by city name | ✅ Done |
| M2 | Current weather is displayed for a searched location: temperature, conditions, wind speed, humidity | ✅ Done |
| M3 | Back-end exposes a RESTful API that acts as the intermediary to a public weather API (the browser never calls the weather provider directly) | ✅ Done (`GET /api/v1/weather`, OpenWeather called server-side only) |
| M4 | API returns meaningful HTTP status codes and error messages (invalid input, unknown location, upstream failure) | ✅ Done (consistent `{ error: { code, message } }` envelope: 400/401/404/502/504/500) |
| M5 | Input validation and sanitisation on all endpoints | ✅ Done (zod schemas via fastify-type-provider-zod) |
| M6 | Rate limiting / request throttling on the API | ✅ Done (`@fastify/rate-limit`: 100 req/min per client IP, 429 on the standard error envelope with `retry-after`/`x-ratelimit-*` headers; `/health` exempt; see ARCHITECTURE.md → API hardening) |
| M7 | Request and error logging | ✅ Done (structured logging via evlog on both apps) |
| M8 | At least one data persistence feature (see choice above) | ✅ Done (per-user search history + PostgreSQL TTL weather cache; see ARCHITECTURE.md → Data and persistence) |
| M9 | Front-end handles loading states and error states (invalid location, API failure) | ✅ Done (empty/loading/not-found/error/success states, retry on failure) |
| M10 | Clean separation between presentation and data logic; clear state management | ✅ Done (api wrapper + `use-weather` hook via TanStack Query; presentational components take DTO props) |
| M11 | Responsive layout across mobile, tablet, and desktop | ⬜ To do |
| M12 | Back-end unit tests (business logic, utilities) and integration tests (API endpoints, edge cases: invalid input, upstream failure) | ✅ Done (Vitest; DTO-mapping/cache/history-logic unit tests + endpoint tests with OpenWeather mocked at the HTTP layer, cache and history storage as in-memory fakes, sessions stubbed: 200/400/401/404/502/504, cache HIT/MISS/STALE. Caveat: the Prisma implementations are exercised against stubs, not a real PostgreSQL — DB integration tests are a known gap that CI with a service container would close) |
| M13 | Front-end unit tests (components, hooks, utilities) | ✅ Done for the weather feature (Vitest + Testing Library: card rendering, search flow incl. loading/not-found/error/retry, history panel incl. signed-out hint/loading/empty/error/delete/click-to-rerun); auth/dashboard components untested |
| M14 | Clear instructions to run the full application locally | ✅ Done (README) |
| M15 | Architecture description and write-up of decisions/trade-offs | 🚧 In progress (ARCHITECTURE.md) |

## Should have

High-value items the brief marks recommended, or that are cheap now and expensive to retrofit.

| # | Requirement | Status |
|---|-------------|--------|
| S1 | User registration and login with secure password handling | ✅ Done (Better-Auth, scrypt hashing) |
| S2 | Session management with secure cookies | ✅ Done (httpOnly, secure, sameSite=lax, first-party via BFF proxy) |
| S3 | Protected endpoints requiring authentication (history) | ✅ Done (Better-Auth session guard on `/api/v1/history`; 401 `UNAUTHENTICATED` envelope, ownership-filtered deletes → 404) |
| S4 | Per-user search history: recorded on search, viewable, re-runnable | ✅ Done (recorded server-side for signed-in searches with consecutive-duplicate dedupe + 50-row cap; Recent searches panel with click-to-rerun and delete) |
| S5 | Server-side weather cache with TTL to reduce external API calls | ✅ Done (PostgreSQL TTL cache: 10 min weather / 24 h geocode, `x-cache` header, stale-on-upstream-failure) |
| S6 | API versioning (`/api/v1/...`) — cheap now, breaking change later | ✅ Done (weather routes live under `/api/v1`) |
| S7 | Health check endpoint (used by Docker/Railway health checks) | ✅ Done (`GET /health` with a 2 s-bounded DB ping: 200 `{ status: "ok" }` / 503 `{ status: "degraded", checks: { database: "down" } }`; docker-compose healthcheck points at it) |
| S8 | Security headers (helmet or equivalent) | ✅ Done (`@fastify/helmet` defaults on the API; nosniff / `X-Frame-Options: DENY` / `Referrer-Policy` on the Next.js app) |
| S9 | CORS configuration | ✅ Done |
| S10 | Deployed and accessible online | ✅ Done (Railway) |
| S11 | Docker Compose setup for running the full stack locally | ✅ Done |

## Could have

Nice-to-haves from the brief's optional enhancements, in rough value-per-effort order.

| # | Requirement | Status |
|---|-------------|--------|
| C1 | CI pipeline (lint, type-check, test on push) | ⬜ To do |
| C2 | API documentation (OpenAPI/Swagger generated from route schemas) | ✅ Done (OpenAPI 3.1 spec generated from the zod route schemas via `@fastify/swagger`, committed at `apps/fumadocs/openapi/weather-api.json` with a spec-drift test, rendered by the Fumadocs app on `pnpm nx dev fumadocs`; regenerate with `pnpm run docs:generate`) |
| C3 | Short forecast (extended weather data) | ⬜ To do |
| C4 | Favourite locations (save/manage) | ⬜ To do |
| C5 | Response compression | ⬜ To do |
| C6 | Pagination on search history | ⬜ To do |
| C7 | One E2E happy-path test (Playwright) | ⬜ To do |
| C8 | UX polish: animations/transitions, empty states, retry options | ⬜ To do |
| C9 | Accessibility checks (ARIA, keyboard navigation) | ⬜ To do |

## Won't have (this iteration)

Consciously out of scope; approach documented in [ARCHITECTURE.md](ARCHITECTURE.md) where relevant.

| # | Requirement | Reasoning |
|---|-------------|-----------|
| W1 | Redis for caching/rate-limit state | PostgreSQL TTL cache is sufficient at this scale; Redis is the documented scaling path |
| W2 | Load/performance testing, contract testing, visual regression testing | Low value at this scale relative to the time cost |
| W3 | Email verification / password reset flows | Beyond the brief's auth scope |
| W4 | Metrics/monitoring stack beyond structured logging | Logging covers the observability requirement; metrics is a documented improvement |
