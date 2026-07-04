# Requirements

Requirements derived from the tech assignment brief, prioritised using MoSCoW. Status reflects the current state of the codebase.

Persistence choice: the brief requires at least one of search history / favourite locations / cached weather data. This project implements **search history** and **server-side cached weather data** (favourites is a could-have).

## Must have

Core functionality and the items the brief lists as required.

| # | Requirement | Status |
|---|-------------|--------|
| M1 | Users can search for a location by city name | ⬜ To do |
| M2 | Current weather is displayed for a searched location: temperature, conditions, wind speed, humidity | ⬜ To do |
| M3 | Back-end exposes a RESTful API that acts as the intermediary to a public weather API (the browser never calls the weather provider directly) | ⬜ To do |
| M4 | API returns meaningful HTTP status codes and error messages (invalid input, unknown location, upstream failure) | ⬜ To do |
| M5 | Input validation and sanitisation on all endpoints | ⬜ To do |
| M6 | Rate limiting / request throttling on the API | ⬜ To do |
| M7 | Request and error logging | ✅ Done (structured logging via evlog on both apps) |
| M8 | At least one data persistence feature (see choice above) | ⬜ To do |
| M9 | Front-end handles loading states and error states (invalid location, API failure) | ⬜ To do |
| M10 | Clean separation between presentation and data logic; clear state management | ⬜ To do |
| M11 | Responsive layout across mobile, tablet, and desktop | ⬜ To do |
| M12 | Back-end unit tests (business logic, utilities) and integration tests (API endpoints, edge cases: invalid input, upstream failure) | ⬜ To do |
| M13 | Front-end unit tests (components, hooks, utilities) | ⬜ To do |
| M14 | Clear instructions to run the full application locally | ✅ Done (README) |
| M15 | Architecture description and write-up of decisions/trade-offs | 🚧 In progress (ARCHITECTURE.md) |

## Should have

High-value items the brief marks recommended, or that are cheap now and expensive to retrofit.

| # | Requirement | Status |
|---|-------------|--------|
| S1 | User registration and login with secure password handling | ✅ Done (Better-Auth, scrypt hashing) |
| S2 | Session management with secure cookies | ✅ Done (httpOnly, secure, sameSite=lax, first-party via BFF proxy) |
| S3 | Protected endpoints requiring authentication (history) | ⬜ To do |
| S4 | Per-user search history: recorded on search, viewable, re-runnable | ⬜ To do |
| S5 | Server-side weather cache with TTL to reduce external API calls | ⬜ To do |
| S6 | API versioning (`/api/v1/...`) — cheap now, breaking change later | ⬜ To do |
| S7 | Health check endpoint (used by Docker/Railway health checks) | 🚧 In progress (bare `/` route exists; formalise as `/health`) |
| S8 | Security headers (helmet or equivalent) | ⬜ To do |
| S9 | CORS configuration | ✅ Done |
| S10 | Deployed and accessible online | ✅ Done (Railway) |
| S11 | Docker Compose setup for running the full stack locally | ✅ Done |

## Could have

Nice-to-haves from the brief's optional enhancements, in rough value-per-effort order.

| # | Requirement | Status |
|---|-------------|--------|
| C1 | CI pipeline (lint, type-check, test on push) | ⬜ To do |
| C2 | API documentation (OpenAPI/Swagger generated from route schemas) | ⬜ To do |
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
