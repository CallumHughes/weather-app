# Epic 3 — API hardening: rate limiting, security headers, health check

Implementation plan for the remaining required/checklist hardening items. Small, focused epic. Self-contained brief; see `docs/plans/epic-1-weather-vertical-slice.md` and `epic-2-persistence.md` for how prior epics were structured — conventions carry over.

## Repo context (delta since Epic 2)

- `apps/server/src/app.ts` exposes `buildApp(opts)` with injectable deps (`cacheStore`, `historyRepo`, `getSession`, timeouts) — extend this pattern for anything this epic needs to test.
- Error handling: `apps/server/src/lib/errors.ts` owns the `{ error: { code, message } }` envelope; every non-2xx response must use it, including the new 429 and 503 paths.
- Routes: `/api/auth/*` (Better-Auth), `/api/v1/weather`, `/api/v1/history` (+ `DELETE /:id`), and a bare `GET /` returning `"OK"` that the docker-compose healthcheck currently hits.
- The browser reaches Fastify only through the Next.js BFF rewrite (web service → `INTERNAL_SERVER_URL`); in production both sit behind Railway's edge proxy. This matters for client-IP handling (below).
- Tests: Vitest, `app.inject()` + fakes, 51 server / 17 web, all mocked (no network/DB). Pre-commit runs Biome + full suite.

## Scope

**In**: per-IP rate limiting with `@fastify/rate-limit` (+ `trustProxy`), security headers via `@fastify/helmet` on the API and a minimal header set on the Next app, a real `/health` endpoint with a DB check, docker-compose healthcheck update, tests, docs.

**Out** (do not build): response compression, per-user rate limiting (document as improvement), Redis-backed rate-limit store, OpenAPI docs, CI, auth-specific brute-force tuning (Better-Auth ships its own rate limiting for auth endpoints — verify it's enabled with defaults and mention it in the docs rather than double-limiting).

## Step 1 — Client IP correctness (`trustProxy`)

Set `trustProxy: true` on the Fastify instance. Without it, every request behind Railway's proxy (and the BFF rewrite) resolves to the proxy's IP and per-IP rate limiting collapses into one shared bucket.

Verify, don't assume: with both dev servers running, hit the API through the web proxy (`:3001/api/v1/weather?...`) and directly (`:3000`), and log `request.ip` — confirm the through-proxy request resolves to the original client IP (Next's rewrite forwards `x-forwarded-for`). Note the finding in the report.

## Step 2 — Rate limiting

Install `@fastify/rate-limit` in `apps/server`.

- Global default: **100 requests / 1 minute per IP** (constants in one place, e.g. `apps/server/src/lib/rate-limit.ts`; make `max`/`timeWindow` injectable via `buildApp` opts so tests can use tiny values).
- Key: `request.ip` (correct once trustProxy is set).
- `/health` must be exempt (health checks poll frequently) — use the route-level `config: { rateLimit: false }` mechanism.
- 429 response must use the standard envelope: `errorResponseBuilder` returning `{ error: { code: "RATE_LIMITED", message: "Too many requests, please try again shortly." } }`. Keep the standard `retry-after` and `x-ratelimit-*` headers enabled.
- Register the limiter before the routes it protects; `/api/auth/*` stays under the global limit too (that's fine — Better-Auth's own limiter is stricter on sensitive endpoints).
- Store is in-memory (per instance). That's acceptable and must be documented: multi-instance scaling moves this to a shared store (Redis) — this is already foreshadowed in ARCHITECTURE.md's scaling section.

## Step 3 — Security headers

- API: install `@fastify/helmet`, register with defaults (a JSON API doesn't need CSP tuning; defaults are fine and include nosniff, frame denial, etc.).
- Web: add a minimal `headers()` entry in `apps/web/next.config.ts` for all routes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. Do **not** attempt a full CSP for the Next app in this epic (Next inline runtime makes strict CSP a project of its own — note it as a future improvement).

## Step 4 — Health endpoint

`GET /health` on the server (new small module or in `app.ts`, wherever it reads cleanest):

- Checks the database with `SELECT 1` through the Prisma client, bounded by a short timeout (~2 s) — make the ping function injectable via `buildApp` opts for tests.
- Healthy → 200 `{ status: "ok" }`. DB unreachable/timeout → 503 `{ status: "degraded", checks: { database: "down" } }` — this one intentionally does not use the error envelope (it's a machine-readable health document, not a client error; note this in the API docs/ARCHITECTURE).
- Exempt from rate limiting (Step 2).
- Keep `GET /` as-is (harmless), but repoint the docker-compose server healthcheck from `/` to `/health`.
- Report should remind the user to set the Railway healthcheck path to `/health` in the service settings (can't be done from the repo).

## Step 5 — Tests

Server (extend existing suites / add `hardening`-focused test files):

- Rate limit: with injected tiny limits (e.g. max 3), the 4th request within the window → 429 with the standard envelope, `retry-after` present; different IPs get separate buckets (inject requests with different `remoteAddress`/`x-forwarded-for` via `app.inject`); `/health` is never limited (hit it more than max times).
- trustProxy: an injected request with `x-forwarded-for` resolves `request.ip` to the forwarded client address (this is what keys the limiter).
- Helmet: any API response carries the expected headers (assert a couple — `x-content-type-options`, `x-frame-options`).
- Health: 200 + `{ status: "ok" }` with a stubbed ping; 503 + degraded body when the ping rejects or exceeds the timeout.
- Regression: existing 68 tests still pass (rate limits must be high enough by default not to trip other suites — or inject generous limits in unrelated test setups).

Web: no new tests required (the header config is declarative); do not break the existing 17.

## Step 6 — Docs (same PR)

- `REQUIREMENTS.md`: M6 (rate limiting) → Done; S7 (health check) → Done; S8 (security headers) → Done.
- `ARCHITECTURE.md`: short "API hardening" decision note — per-IP in-memory rate limiting with the envelope-consistent 429, why trustProxy is required behind Railway/the BFF, helmet defaults, health endpoint semantics (200/503, exempt from limits), Better-Auth's built-in auth rate limiting, and the Redis-store swap as the multi-instance path (cross-link the scaling section). Mention strict CSP for the web app as a future improvement.
- `README.md`: mention `/health` (and that docker-compose uses it).

## Acceptance checklist

- [ ] `pnpm nx run-many -t check-types`, `pnpm run check`, all tests pass (existing 68 + new ones).
- [ ] Live: hammering `/api/v1/weather` past the limit returns 429 with the standard envelope and `retry-after`; `/health` returns 200 with the DB up; stopping Postgres flips it to 503 degraded (verify if practical, otherwise test-verified is acceptable — say which).
- [ ] `request.ip` through the BFF proxy resolves to the client, not the web container (Step 1 verification reported).
- [ ] API responses carry helmet headers; web responses carry the three configured headers.
- [ ] docker-compose server healthcheck points at `/health`.
- [ ] 429 and 503 bodies match the documented shapes; all other error responses unchanged.

## Watch out for

- Register order matters in Fastify: helmet and rate-limit are global plugins — register them before route plugins so they apply everywhere; confirm the auth route (registered directly in `app.ts`) is covered.
- The existing test suites make many rapid `inject` calls — default limits must not flake them. `app.inject` requests all share the same default remote address; if suites start tripping the limiter, inject a high default in the test `buildApp` helper rather than weakening production defaults.
- `@fastify/rate-limit` + Fastify 5: use the current major; check the README for the exact `errorResponseBuilder` and per-route exemption signatures rather than trusting memory.
- Don't cache `/health` responses anywhere, and keep its DB ping cheap — it will be polled.
- Biome + pre-commit run on commit; keep everything green.
