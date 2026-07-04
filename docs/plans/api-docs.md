# Task — API documentation: OpenAPI spec rendered in Fumadocs

Implementation plan for generated API documentation. The spec is derived from the real zod route schemas (so docs cannot drift from the implementation), emitted as a committed `openapi.json`, and rendered by the existing Fumadocs app. Self-contained brief; prior epic plans in `docs/plans/` show the conventions.

## Repo context

- `apps/server`: Fastify 5 with `fastify-type-provider-zod` — every `/api/v1` route already declares zod schemas for querystring/params/responses; error envelope and codes live in `apps/server/src/lib/errors.ts`. `buildApp(opts)` accepts injectable deps (`cacheStore`, `historyRepo`, `getSession`, `health.dbPing`, rate-limit opts) — the spec-generation script must use fakes so it never needs a DB or env secrets (`SKIP_ENV_VALIDATION=1` is supported by `packages/env`).
- `apps/fumadocs`: stock Fumadocs 16 scaffold (Next 16, `fumadocs-core`/`fumadocs-mdx`/`fumadocs-ui` 16.10.x), dev port 4000, content in `apps/fumadocs/content/docs/` (currently placeholder `index.mdx` + `test.mdx`), source config in `source.config.ts`, MDX components in `src/components/mdx.tsx`. It has its own biome config and a `types:check` script (note: named differently from the workspace-wide `check-types` target).
- Routes to document: `GET /api/v1/weather`, `GET /api/v1/history`, `DELETE /api/v1/history/:id`, `GET /health`. Auth endpoints (`/api/auth/*`) are Better-Auth's — do NOT hand-document each one; see Step 4.
- Nx orchestrates tasks; pre-commit runs Biome + the full test suite.

## Scope

**In**: `@fastify/swagger` spec generation from the existing zod schemas, a committed `openapi.json` + regeneration script, a spec-drift test, `fumadocs-openapi` rendering, a small set of hand-written docs pages (overview, auth, errors, rate limits), README/REQUIREMENTS/ARCHITECTURE updates.

**Out**: deploying the docs app (local/dev only for now — note it), Better-Auth's own OpenAPI plugin (mention as future), API keys/SDK generation, versioned docs, CI.

## Step 1 — OpenAPI spec from the server's schemas

Install `@fastify/swagger` in `apps/server`.

- Register it in `buildApp()` with the `jsonSchemaTransform` from `fastify-type-provider-zod` (this is the documented pairing — check the fastify-type-provider-zod README for the current export name/usage rather than trusting memory).
- Spec metadata: title "Weather App API", version from the API prefix (`1.0.0` ↔ `/api/v1`), a short description covering the base URL model (same-origin `/api/*` via the BFF in production; `http://localhost:3000` direct in dev).
- Tag routes: `Weather`, `History`, `Health`. Add per-route `summary`/`description` and document all response codes each route can return — success DTOs plus the error envelope for 400/401/404/429/502/504 as applicable and the `/health` 200/503 documents. The error envelope schema should appear once as a shared component, not inlined per route.
- Add `.describe()` / `.meta()` annotations to the zod schemas where field meaning isn't obvious (e.g. `x-cache` header semantics, `location` accepts free text). Document the `x-cache: HIT|MISS|STALE` response header on `/api/v1/weather`.
- Exclude `/api/auth/*` from the generated spec (`hide: true` on that route or schema-level exclusion) — it's a proxy to Better-Auth, covered by a hand-written page instead.
- Do not expose a live `/documentation` UI from Fastify — Fumadocs is the UI; the server only produces the spec.

## Step 2 — Committed spec + drift guard

- Script `apps/server/src/scripts/generate-openapi.ts`: `SKIP_ENV_VALIDATION=1`, `buildApp()` with in-memory fakes (reuse `src/test/fakes.ts`), `await app.ready()`, `app.swagger()`, write pretty-printed JSON to `apps/fumadocs/openapi/weather-api.json` (committed).
- Server package script `openapi:generate` (runs via `tsx`); root alias `docs:generate` that regenerates the spec and then the Fumadocs pages (Step 3) in one command.
- **Drift test** (`apps/server/src/openapi.test.ts`): build the spec in-memory the same way and deep-compare against the committed file — a schema change without regeneration fails the suite (and therefore pre-commit, our CI stand-in). Keep the comparison order-stable (stringify with sorted keys or compare parsed objects).

## Step 3 — Render in Fumadocs

Install `fumadocs-openapi` in `apps/fumadocs`. **Follow the current fumadocs-openapi docs for v16-compatible setup** (the API has moved between majors — use the fumadocs docs site or context7, don't code from memory). Expected shape, subject to those docs:

- An `openapi` server config (e.g. `src/lib/openapi.ts` via `createOpenAPI`) pointing at `openapi/weather-api.json`.
- Generated MDX pages for the operations into `content/docs/api/` via the package's `generateFiles` script — wire it into the root `docs:generate` command; commit the generated MDX so the docs app builds hermetically. Add a `meta.json` so the API section is ordered sensibly in the sidebar.
- Register the `APIPage` component in `src/components/mdx.tsx` and whatever `source.config.ts` changes the integration needs.

Hand-written pages (replace the placeholder `index.mdx`/`test.mdx`):

- `index.mdx` — what the API is, base URLs (BFF same-origin in production, `:3000` in dev), link to the repo README/ARCHITECTURE for setup and design.
- `authentication.mdx` — session-cookie auth via Better-Auth through the same-origin BFF proxy: register/login via `/api/auth/*`, cookie is `httpOnly`/`sameSite=lax`, guarded endpoints return the 401 envelope. Note Better-Auth's own OpenAPI plugin as the future path for documenting the auth endpoints themselves.
- `errors.mdx` — the error envelope, the full code table (VALIDATION_ERROR, LOCATION_NOT_FOUND, UNAUTHENTICATED, NOT_FOUND, RATE_LIMITED, UPSTREAM_ERROR, UPSTREAM_TIMEOUT, INTERNAL_ERROR) with statuses and when each occurs.
- `rate-limits.mdx` — 100 req/min per IP, 429 shape, `retry-after`/`x-ratelimit-*` headers, `/health` exemption.

Keep prose short — the generated operation pages carry the detail.

## Step 4 — Workspace integration

- Rename the fumadocs `types:check` script to `check-types` so `pnpm nx run-many -t check-types` includes it (verify it passes; fix what surfaces).
- Make sure `pnpm nx dev fumadocs` works alongside the other dev servers (port 4000) and `pnpm nx build fumadocs` succeeds with the generated content.
- Do NOT add fumadocs to docker-compose or deployment — out of scope; docs run locally.

## Step 5 — Docs-about-the-docs (same PR)

- `REQUIREMENTS.md`: C2 (API documentation) → Done.
- `ARCHITECTURE.md`: short decision note — OpenAPI generated from the zod route schemas at the source of truth, committed spec with a drift test standing in for CI, rendered by Fumadocs; docs app not deployed (future improvement alongside CI).
- `README.md`: add the docs app to the project-structure tree and Common Commands (`pnpm nx dev fumadocs` → http://localhost:4000, `pnpm run docs:generate` to regenerate after API changes).

## Acceptance checklist

- [ ] `pnpm run docs:generate` (root) regenerates spec + MDX in one shot; output is committed and stable across two consecutive runs (no timestamp churn).
- [ ] Drift test fails if a route schema changes without regeneration (verify by temporarily editing a schema, then revert).
- [ ] `pnpm nx dev fumadocs` renders: sidebar with Overview/Auth/Errors/Rate limits + API section; each of the four endpoints has a page showing parameters, response schema, and error responses; the weather page documents `x-cache`.
- [ ] `pnpm nx build fumadocs` succeeds; `pnpm nx run-many -t check-types` now includes fumadocs and passes; Biome clean; full test suite green.
- [ ] Generated spec contains no secrets, no upstream OpenWeather URLs, and excludes `/api/auth/*`.
- [ ] Existing server behaviour unchanged (spec generation must not alter routes/handlers beyond added descriptions).

## Watch out for

- Version compatibility: `fumadocs-openapi` must match fumadocs-core/ui 16.10.x — check its peer deps before installing. Note the fumadocs app pins TypeScript 6 / @types/node 26 (different from the rest of the workspace); keep its dependencies self-contained within `apps/fumadocs`.
- `@fastify/swagger` + `fastify-type-provider-zod`: response schemas only appear for codes you declare in each route's `schema.response` — audit each route declares every status it can actually return (the Epic 1–3 tests enumerate them).
- The spec script must run without: a database, real env vars, or network. If `buildApp` pulls anything eager at import time that breaks under `SKIP_ENV_VALIDATION`, fix the import to be lazy rather than weakening validation.
- Generated MDX + Biome/lint-staged: generated files may not be Biome-clean — exclude `apps/fumadocs/content/docs/api/` (and the committed spec) from Biome via config rather than hand-editing generated output.
- Fumadocs app was scaffolded with its own biome.json and README — leave its internal tooling alone except where the plan says otherwise.
- Two consecutive `docs:generate` runs must produce byte-identical output, or the drift test and lint-staged will fight — strip any generated timestamps.
