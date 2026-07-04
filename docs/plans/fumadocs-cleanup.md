# Task — Fumadocs app cleanup: README, branding, home route

Small cleanup task on the `apps/fumadocs` app, following the API-docs task (`docs/plans/api-docs.md`). Everything here is inside `apps/fumadocs/` except where noted.

## Context

- The app renders hand-written MDX (`content/docs/*.mdx`) plus generated API reference pages (`content/docs/api/`, produced from the committed OpenAPI spec at `openapi/weather-api.json`).
- Regeneration pipeline: root `pnpm run docs:generate` → server `openapi:generate` (spec from zod route schemas) → fumadocs `scripts/generate-api-docs.ts` (MDX). A drift test in `apps/server/src/openapi.test.ts` fails the suite if the spec is stale; generated files are Biome-excluded and must never be hand-edited.
- Scaffold leftovers to fix: `src/lib/shared.ts` exports `appName = "My App"` and a `gitConfig` pointing at `fuma-nama/fumadocs` (both flow into the nav via `src/lib/layout.shared.tsx` — the nav title and the GitHub icon link are currently wrong); `src/app/(home)/page.tsx` is a "Hello World" placeholder; `README.md` is the untouched Create Fumadocs boilerplate (wrong port `3000`, `npm`/`yarn` commands, no mention of the OpenAPI pipeline).

## Changes

### 1. Branding (`src/lib/shared.ts`)

- `appName` → `"Weather App API"` (it titles the docs nav; "API" makes the scope clear).
- `gitConfig` → `{ user: "CallumHughes", repo: "weather-app", branch: "main" }`.

### 2. Home route → redirect to /docs

The landing page has no purpose — the docs are the app. In `src/app/(home)/page.tsx`, replace the component with a server-side redirect:

```tsx
import { redirect } from "next/navigation";
import { docsRoute } from "@/lib/shared";

export default function HomePage() {
  redirect(docsRoute);
}
```

- Delete `src/app/(home)/layout.tsx` (the HomeLayout wrapper becomes dead code once the page never renders); the `(home)` group then only holds the redirect page — collapse it to `src/app/page.tsx` if that's cleaner, but don't disturb the `llms.txt`/`og` routes.
- Verify `/` 307s to `/docs` in the dev server and that `pnpm nx build fumadocs` still succeeds (a redirect page must not break SSG).

### 3. Rewrite `README.md`

Replace the Create Fumadocs boilerplate entirely. Cover, briefly:

- **What this app is**: API documentation for the weather-app API — hand-written guides plus an API reference generated from the OpenAPI spec, which is itself generated from the server's zod route schemas (link to the repo-root README/ARCHITECTURE for the wider picture).
- **Run it**: `pnpm nx dev fumadocs` from the repo root → http://localhost:4000 (correct the boilerplate's port 3000 / npm / yarn).
- **Regenerate after API changes**: `pnpm run docs:generate` from the repo root; explain the two steps it runs and that the drift test in `apps/server` fails pre-commit if the committed spec is stale.
- **Content layout**: `content/docs/*.mdx` hand-written (edit freely); `content/docs/api/**` + `openapi/weather-api.json` generated (never hand-edit; Biome-excluded); `meta.json` controls sidebar order.
- **Key files**: `src/lib/openapi.ts` (fumadocs-openapi config), `src/components/api-page.tsx`, `scripts/generate-api-docs.ts`, `source.config.ts`.
- Keep the useful upstream links (fumadocs.dev) as a short "learn more" footer; drop the Next.js tutorial boilerplate.

## Verification

- [ ] Nav shows "Weather App API"; GitHub icon links to CallumHughes/weather-app.
- [ ] `/` redirects to `/docs` in dev; `pnpm nx build fumadocs` passes.
- [ ] README instructions work as written when followed from the repo root.
- [ ] `pnpm nx run-many -t check-types`, `pnpm run check`, full test suite all green (pre-commit enforces).

No REQUIREMENTS/ARCHITECTURE changes needed — this is cosmetic cleanup within the docs app.
