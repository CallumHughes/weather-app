# weather-app

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Fastify, and more.

## Documentation

- [REQUIREMENTS.md](REQUIREMENTS.md) — MoSCoW-prioritised requirements and their current status
- [ARCHITECTURE.md](ARCHITECTURE.md) — design decisions, trade-offs, assumptions, and future improvements

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Fastify** - Fast, low-overhead web framework
- **Node.js** - Runtime environment
- **Prisma** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Nx** - Smart monorepo task orchestration and caching
- **Biome** - Linting and formatting
- **Husky** - Git hooks for code quality

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Environment Variables

Each app reads its own `.env` file. Create them before first run.

`apps/server/.env`:

```dotenv
DATABASE_URL=postgresql://postgres:password@localhost:5432/weather-app
BETTER_AUTH_SECRET=<generated secret, see below>
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
OPENWEATHER_API_KEY=<your OpenWeather API key, see below>
```

`apps/web/.env`:

```dotenv
INTERNAL_SERVER_URL=http://localhost:3000
```

All variables are validated at startup by the schemas in `packages/env` — the apps fail fast with a clear error if anything is missing or malformed.

### Generating `BETTER_AUTH_SECRET`

Better-Auth uses this secret to sign session cookies. It must be at least 32 characters and should be unique per environment (never reuse the local one in production):

```bash
openssl rand -base64 32
```

If you don't have `openssl` available:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Paste the output as the value of `BETTER_AUTH_SECRET` in `apps/server/.env`.

### Getting `OPENWEATHER_API_KEY`

Weather data comes from [OpenWeather](https://openweathermap.org). Create (or copy) an API key at [https://home.openweathermap.org/api_keys](https://home.openweathermap.org/api_keys) and paste it as the value of `OPENWEATHER_API_KEY` in `apps/server/.env`. The free tier covers everything this app uses (geocoding + current weather).

Note: newly created OpenWeather keys can take a little while (up to ~an hour) to activate — until then the upstream API returns 401 and weather searches will fail with an upstream error.

## Database Setup

This project uses PostgreSQL with Prisma.

1. Start a local PostgreSQL instance (uses Docker, matches the `DATABASE_URL` above):

```bash
pnpm run db:start
```

Alternatively, point `DATABASE_URL` in `apps/server/.env` at any PostgreSQL instance you already have.

2. Apply the database migrations:

```bash
pnpm nx db:migrate @weather-app/db
```

This runs `prisma migrate dev`: it applies all pending migrations from `packages/db/prisma/migrations` and regenerates the Prisma client. It is also the command to use when changing the schema during development, as it creates a new migration file. In production, migrations are applied with `prisma migrate deploy` (`db:migrate:deploy` in `packages/db`), which only applies existing migrations.

Then, run the development servers (web + API):

```bash
pnpm nx run-many -t dev
```

Or start a single app with `pnpm nx dev web` / `pnpm nx dev server`.

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

Notes on features:

- **Search history** requires an account — sign up / sign in from the header; the "Recent searches" panel on the home page then records your searches (click an entry to re-run it, or delete it). Signed-out searches are never stored.
- **Weather caching**: repeated searches are served from a PostgreSQL TTL cache instead of hitting OpenWeather (10 min for weather, 24 h for geocoding). The `x-cache: HIT | MISS | STALE` response header on `/api/v1/weather` shows what happened; no extra setup or environment variables are needed.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@weather-app/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: pnpm run docker:build
- Start: pnpm run docker:up
- Logs: pnpm run docker:logs
- Stop: pnpm run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

## Git Hooks and Formatting

- Initialize hooks: `pnpm run prepare`
- Run checks: `pnpm run check`

The pre-commit hook runs lint/format on staged files (Biome via lint-staged) and the full test suite (`pnpm nx run-many -t test`). Nx caching keeps this fast — unaffected projects replay cached results. This acts as a lightweight CI alternative for now; see the decision in [ARCHITECTURE.md](ARCHITECTURE.md).

## Project Structure

```
weather-app/
├── apps/
│   ├── web/         # Frontend application (Next.js)
│   └── server/      # Backend API (Fastify)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Common Commands

Tasks are orchestrated by [Nx](https://nx.dev) (with computation caching, so unchanged projects are not rebuilt/rechecked). The root `package.json` provides short `pnpm run` aliases for the most common ones.

### Development

| Task | Nx command | Alias |
|------|------------|-------|
| Start all apps in dev mode | `pnpm nx run-many -t dev` | `pnpm run dev` |
| Start only the web app | `pnpm nx dev web` | `pnpm run dev:web` |
| Start only the API server | `pnpm nx dev server` | `pnpm run dev:server` |
| Build all apps | `pnpm nx run-many -t build` | `pnpm run build` |
| Type-check all projects | `pnpm nx run-many -t check-types` | `pnpm run check-types` |
| Run all tests (Vitest) | `pnpm nx run-many -t test` | `pnpm run test` |

### Database

| Task | Nx command | Alias |
|------|------------|-------|
| Create/apply migrations (`prisma migrate dev`) | `pnpm nx db:migrate @weather-app/db` | `pnpm run db:migrate` |
| Generate Prisma client/types | `pnpm nx db:generate @weather-app/db` | `pnpm run db:generate` |
| Open Prisma Studio | `pnpm nx db:studio @weather-app/db` | `pnpm run db:studio` |

The local PostgreSQL container is managed with Docker Compose (not Nx): `pnpm run db:start` / `pnpm run db:stop`.

### Other

- `pnpm run check`: Run Biome formatting and linting
- `pnpm run docker:build`: Build the Docker Compose images
- `pnpm run docker:up`: Build and start the Docker Compose stack
- `pnpm run docker:logs`: Tail logs from the Docker Compose stack
- `pnpm run docker:down`: Stop the Docker Compose stack

Nx extras: `pnpm nx graph` visualises the project/task dependency graph; `pnpm nx show projects` lists all workspace projects.
