# Weather App API docs

API documentation for the weather-app API, built with [Fumadocs](https://fumadocs.dev). It serves hand-written guides (authentication, errors, rate limits) alongside an API reference that is **generated** from the OpenAPI spec — which is itself generated from the server's zod route schemas, so the reference cannot drift from the implementation.

See the repo-root [README](../../README.md) and [ARCHITECTURE.md](../../ARCHITECTURE.md) for the wider project.

## Run it

From the repo root:

```bash
pnpm nx dev fumadocs
```

Open http://localhost:4000 — the root route redirects to `/docs`.

## Regenerating after API changes

When a server route or schema changes, regenerate the spec and the API reference pages from the repo root:

```bash
pnpm run docs:generate
```

This runs two steps:

1. `apps/server` `openapi:generate` — builds the OpenAPI 3.1 spec from the live route schemas (no database or network needed) and writes it to `openapi/weather-api.json` in this app.
2. `scripts/generate-api-docs.ts` (this app) — regenerates the MDX pages under `content/docs/api/` from that spec.

A drift test in `apps/server/src/openapi.test.ts` compares the committed spec against a freshly built one, so forgetting to regenerate fails the test suite (and therefore the pre-commit hook).

## Content layout

| Path | What it is |
|------|------------|
| `content/docs/*.mdx` | Hand-written pages — edit freely |
| `content/docs/meta.json` | Sidebar order |
| `content/docs/api/**` | **Generated** API reference — never hand-edit; regenerate instead |
| `openapi/weather-api.json` | **Generated** OpenAPI spec — never hand-edit; regenerate instead |

Generated files are excluded from Biome.

## Key files

- `src/lib/openapi.ts` — fumadocs-openapi server config (points at the spec)
- `src/components/api-page.tsx` — renders the interactive endpoint pages
- `scripts/generate-api-docs.ts` — MDX generation from the spec
- `source.config.ts` — Fumadocs MDX source configuration
- `src/lib/shared.ts` — app name and repo links used by the nav

## Learn more

- [Fumadocs](https://fumadocs.dev) — framework documentation
- [fumadocs-openapi](https://fumadocs.dev/docs/ui/openapi) — the OpenAPI integration
