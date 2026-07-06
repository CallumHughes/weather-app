# weather-app

A full-stack weather application: search for a city, see its current conditions, and — with an account — keep a searchable history and a reorderable board of favourite locations. The front-end is a Next.js app; all weather data flows through a Fastify REST API that fronts OpenWeather, caches responses in PostgreSQL, and owns authentication and persistence.

## Live deployment

- Weather app: [https://weather-app-web-production.up.railway.app](https://weather-app-web-production.up.railway.app)
- API docs: [https://weather-app-fumadocs-production.up.railway.app](https://weather-app-fumadocs-production.up.railway.app)

## Features

- **Location search** — free-text city search (`GET /api/v1/weather`), geocoded server-side; temperature, conditions, wind, and humidity for the resolved place
- **Accounts** — email/password registration and sign-in (Better-Auth), first-party session cookies via a BFF proxy; history and favourites are per-user and protected
- **Recent searches** — signed-in searches are recorded server-side; the panel shows the latest five, each re-runnable or deletable (signed-out searches are never stored)
- **Favourite locations** — star a result to save it (capped at 20, duplicates rejected), shown as a board with live conditions and drag-to-reorder
- **Server-side weather cache** — PostgreSQL TTL cache (10 min weather / 24 h geocoding) with stale-on-upstream-failure; the `x-cache: HIT | MISS | STALE` header shows what happened
- **API hardening** — consistent `{ error: { code, message } }` envelope, zod validation on every endpoint, rate limiting (100 req/min per IP, 429 + `retry-after`), helmet security headers, structured request/error logging
- **Health check** — `GET /health` reports 200 when the database is reachable, 503 when degraded; wired into the Docker Compose and Railway health checks
- **Shared API contract** — one set of zod schemas (`packages/schemas`) types and validates both the Fastify routes and the web client, and generates the OpenAPI 3.1 docs (rendered by the Fumadocs app, with a drift test keeping spec and implementation in sync)

The full requirement list (MoSCoW-prioritised, with status) is in [REQUIREMENTS.md](REQUIREMENTS.md).

## Documentation

- [REQUIREMENTS.md](REQUIREMENTS.md) — requirements derived from the brief and their current status
- [ARCHITECTURE.md](ARCHITECTURE.md) — system diagram, design decisions and trade-offs, technology justifications, assumptions, known bugs, future improvements, scaling approach
- API documentation — rendered from the generated OpenAPI spec: [hosted docs](https://weather-app-fumadocs-production.up.railway.app), or locally with `pnpm nx dev fumadocs` → [http://localhost:4000/docs](http://localhost:4000/docs) (regenerate with `pnpm run docs:generate`)

## Stack

TypeScript end-to-end: Next.js (App Router) + Tailwind + shadcn/ui + TanStack Query on the front-end; Fastify + Prisma + PostgreSQL + Better-Auth on the back-end; shared zod schemas across both; Nx + pnpm workspaces for the monorepo, Biome for lint/format, Vitest for tests, Docker for packaging. Each choice is justified in [ARCHITECTURE.md → Technology choices](ARCHITECTURE.md#technology-choices).

## Running locally

Prerequisites: Node.js 24+, pnpm 10, Docker.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Environment variables

Each app reads its own `.env` file. Copy the committed examples:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
cp apps/fumadocs/.env.example apps/fumadocs/.env   # only needed for the API docs app
```

Only `apps/server/.env` has placeholders to replace — everything is validated at startup by the schemas in `packages/env`, so the apps fail fast with a clear error if anything is missing or malformed (including unedited placeholders):

- **`BETTER_AUTH_SECRET`** — signs session cookies; at least 32 characters, unique per environment:

  ```bash
  openssl rand -base64 32
  ```

- **`OPENWEATHER_API_KEY`** — weather data comes from [OpenWeather](https://openweathermap.org); create a key at [https://home.openweathermap.org/api_keys](https://home.openweathermap.org/api_keys) (the free tier covers everything this app uses). Newly created keys can take up to ~an hour to activate — until then, weather searches fail with an upstream error.

### 3. Database

Start a local PostgreSQL (Docker, matches the committed `DATABASE_URL`), then apply migrations:

```bash
pnpm run db:start
pnpm nx db:migrate @weather-app/db
```

`db:migrate` runs `prisma migrate dev` — it applies pending migrations from `packages/db/prisma/migrations`, regenerates the Prisma client, and is also the command for schema changes during development. Production uses `prisma migrate deploy` (the `db:migrate:deploy` target), which only applies existing migrations. To use an existing PostgreSQL instead, point `DATABASE_URL` in `apps/server/.env` at it.

### 4. Run the apps

```bash
pnpm nx run-many -t dev
```

- Web app: [http://localhost:3001](http://localhost:3001)
- API: [http://localhost:3000](http://localhost:3000)

Or start one app: `pnpm nx dev web` / `pnpm nx dev server` / `pnpm nx dev fumadocs`.

### Docker Compose (full stack)

The whole stack — web, API, PostgreSQL, and a one-shot migration service — runs with:

```bash
pnpm run docker:up      # build and start
pnpm run docker:logs    # tail logs
pnpm run docker:down    # stop
```

Migrations are applied automatically after PostgreSQL is healthy and before the server starts, so a fresh `docker:up` brings up a working stack. Environment variables come from each app's `.env` file (public web variables are baked in at build time), overridden in `docker-compose.yml` for container networking.

## Commands

Tasks are orchestrated by [Nx](https://nx.dev) with computation caching — unchanged projects replay cached results.

| Task | Command |
|------|---------|
| Start all apps in dev mode | `pnpm nx run-many -t dev` |
| Start one app | `pnpm nx dev web` / `pnpm nx dev server` / `pnpm nx dev fumadocs` |
| Build all apps | `pnpm nx run-many -t build` |
| Run all tests (Vitest) | `pnpm nx run-many -t test` |
| Lint all projects (Biome, check-only) | `pnpm nx run-many -t lint` |
| Type-check all projects | `pnpm nx run-many -t check-types` |
| Create/apply DB migrations | `pnpm nx db:migrate @weather-app/db` |
| Regenerate Prisma client/types | `pnpm nx db:generate @weather-app/db` |
| Open Prisma Studio | `pnpm nx db:studio @weather-app/db` |

Non-Nx utilities: `pnpm run db:start` / `db:stop` (local PostgreSQL container), `pnpm run docker:*` (Compose stack), `pnpm run check` (Biome, applies fixes), `pnpm run docs:generate` (OpenAPI spec + docs pages).

Nx extras: `pnpm nx graph` visualises the project/task dependency graph; `pnpm nx show projects` lists all workspace projects.

## Quality gates

The husky pre-commit hook runs Biome lint and the full test suite across the workspace (`nx run-many -t lint test`); Nx caching keeps it fast, and the workspace root is itself an Nx project so root-level config files are linted too. Lint is check-only in the hook — run `pnpm run check` to apply fixes. This is a deliberate stopgap for CI; see the decision and its trade-offs in [ARCHITECTURE.md → Pre-commit quality gates](ARCHITECTURE.md#pre-commit-quality-gates-instead-of-ci-for-now). Initialize hooks after cloning with `pnpm run prepare`.

## Project structure

```
weather-app/
├── apps/
│   ├── web/         # Front-end (Next.js) — proxies /api/* to the server
│   ├── server/      # REST API (Fastify) — weather, auth, history, favourites
│   └── fumadocs/    # API documentation site (Fumadocs, rendered OpenAPI)
├── packages/
│   ├── schemas/     # Zod API contract shared by web and server
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── auth/        # Better-Auth configuration
│   ├── db/          # Prisma schema, migrations, client
│   ├── env/         # Zod-validated environment schemas
│   └── config/      # Shared TypeScript config
```
