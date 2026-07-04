# Task — UI redesign (home-page-only layout, shadcn components, auth drawer)

Implement the new visual design for the web app based on the approved mockups. Everything is front-end (`apps/web` + `packages/ui`); **no server, schema, or API changes**. The design must be built from shadcn/ui components — this repo uses the **Base UI variant** (`"style": "base-lyra"` in `components.json`, `@base-ui/react` under the hood), so every component added via the CLI comes out in that style (note the `render={...}` prop instead of `asChild`, as seen in `user-menu.tsx`).

Mockup reference (design intent, not pixel spec — they are static HTML sketches):

- `~/Downloads/weather_app_desktop_main_view.html` — desktop: search bar row, current-weather card, sidebar with Favourites, Recent searches, and an account chip.
- `~/Downloads/weather_app_mobile_layout.html` — mobile: single column, favourite chips under the search bar, compact weather card.
- `~/Downloads/weather_app_loading_and_error_states.html` — empty / loading-skeleton / not-found / upstream-error states.

Map the mockups' CSS variables to the shadcn theme tokens already in `packages/ui/src/styles/globals.css`: `--surface-2` → `bg-card`, `--surface-1` → `bg-muted`, `--text-muted` → `text-muted-foreground`, `--radius` → default component radii. Never hard-code colours; everything must work in light and dark mode (the app has `ModeToggle` + `next-themes`).

## Scope decisions (already made — do not re-litigate)

**In scope:**

1. Remove the nav and the dashboard entirely — the home page is the only page.
2. Login/sign-up move onto the home page as a **responsive drawer**: shadcn Base UI Drawer on mobile, Dialog on desktop (https://ui.shadcn.com/docs/components/base/drawer#responsive — the pattern conditionally renders `Dialog` vs `Drawer` using the `use-mobile` hook). Form styling follows the shadcn `login-01` block (Card-less field layout with `Field`/`FieldGroup` primitives), adapted to the existing TanStack Form + Better-Auth logic. **No SSO buttons.**
3. Desktop layout, weather card redesign, stat tiles, sidebar cards, account chip, mobile favourite-chip row, and the four result states per the mockups.
4. "Updated X min ago · cached" line on the weather card — the API already sends `x-cache: HIT | MISS | STALE` on `GET /api/v1/weather`; the client just doesn't read it yet.

**Explicitly NOT in scope (mockup elements to drop):**

- The 5-day forecast strip/list (both mockups) — no forecast endpoint exists and it is not required.
- Visibility stat tile — not in the weather DTO; use the three metrics the DTO has (wind, humidity, feels-like).
- Temperatures next to favourites (e.g. "London 16°") — would need N weather fetches per render; favourites rows stay name-only.
- "Did you mean Manchester, GB?" suggestion on the not-found state — no suggestions API.
- "Show cached" button on the upstream-error state — stale-cache serving is automatic server-side; keep Retry only.
- The mockup's "Search a city or postcode" placeholder — the geocoder is city-name based; keep the placeholder honest ("Search for a city…").

## Repo context

- Web app: `apps/web` (Next.js App Router, port 3001, `pnpm nx dev web`; the API must be up for real data: `pnpm nx dev server` + `pnpm run db:start`).
- Shared shadcn components live in `packages/ui/src/components/`, exported as `@weather-app/ui/components/*`; hooks export path `@weather-app/ui/hooks/*` already exists in `package.json` (no `src/hooks` dir yet — the CLI will create it). **Add new shadcn components by running the CLI from `packages/ui`** (its `components.json` aliases write into the package): `pnpm dlx shadcn@latest add drawer dialog avatar badge field alert use-mobile` (adjust the list if a piece turns out unnecessary; `input-group` is already present).
- Existing weather UI: `apps/web/src/components/weather/` — `weather-home.tsx` (layout + lifted search state), `weather-search.tsx` (form + result states), `weather-card.tsx` (presentational), `weather-skeleton.tsx`, `favourites.tsx`, `search-history.tsx`. Hooks in `apps/web/src/hooks/`, typed fetch wrapper in `apps/web/src/lib/api.ts`.
- Tests: Vitest + Testing Library, colocated `*.test.tsx`; fixtures in `weather.fixtures.ts`. **The pre-commit hook runs the full test suite** — every behavioural change here must land with its test updates. `use-mobile` relies on `window.matchMedia`; if jsdom complains, add a `matchMedia` stub to `apps/web/vitest.setup.ts`.
- Lint/format is Biome (`pnpm exec biome check --write .`); it runs via lint-staged pre-commit.

## Step 1 — Add the shadcn pieces

From `packages/ui`: add `drawer`, `dialog`, `avatar`, `badge`, `field`, `alert`, and the `use-mobile` hook (CLI command above). Verify each lands in `src/components/` / `src/hooks/` in the Base UI style and that `pnpm nx check-types @weather-app/ui` passes. Fetch the `login-01` block source for reference only (`pnpm dlx shadcn@latest view @shadcn/login-01`) — don't add it as a block; its page/component files assume a standalone route. Copy its form markup structure into Step 4's forms.

## Step 2 — Kill the nav and dashboard

- Delete `apps/web/src/app/dashboard/` (both files).
- `apps/web/src/components/header.tsx`: drop the nav links entirely. The header becomes a slim bar: app name ("Weather", plain text or a small cloud icon) on the left; right side `ModeToggle` plus — **only when signed out** — a "Sign in" button that opens the auth drawer (Step 4). When signed in the header shows nothing else: account info lives in the sidebar chip (Step 3). Delete `user-menu.tsx` (superseded by the chip + the header trigger).
- Remove the `/dashboard` redirects in `sign-in-form.tsx` / `sign-up-form.tsx` (Step 4 replaces them with "close the drawer, stay on the home page").
- Move the page heading ("Weather" + subtitle) out of `app/page.tsx` if it fights the new header — one "Weather" wordmark is enough; the mockup has no page-level heading, just the search row.

## Step 3 — Home layout + weather card redesign

**Layout (`weather-home.tsx` / `page.tsx`)** — desktop mockup structure:

- Search row at the top, full width: `InputGroup` (already in `packages/ui`) with a search icon (lucide `Search`) inside the field, submit button to the right. This replaces the current Label-above-Input form in `weather-search.tsx`.
- Below it a two-column grid, `minmax(0, 2fr) / minmax(0, 1fr)`-ish (`lg:grid-cols-[minmax(0,1fr)_20rem]` is close to current — keep whatever reads best): left column = result area; right column = sidebar (Favourites card, Recent searches card, account chip).
- **Mobile** (below `lg`): single column. Under the search bar, a horizontally scrollable row of **favourite chips** (`Badge` with a star icon, tap re-runs that search via the existing lifted `onSelect` mechanism) shown only when signed in with ≥1 favourite. Hide the sidebar Favourites card on mobile (`hidden lg:block`) so favourites aren't shown twice; Recent searches card stacks below the result. The account chip can stay at the bottom of the stack.

**Weather card (`weather-card.tsx`)** — per the desktop mockup:

- Header: map-pin icon (lucide `MapPin`) + place name; the star toggle stays in `CardAction` (unchanged behaviour/aria).
- Sub-line: `Updated {relative} · cached` — extract `formatRelativeTime` from `search-history.tsx` into a small shared util (`apps/web/src/lib/format.ts`) and reuse it against `current.observedAt`; append "· cached" only when the cache flag (below) is `HIT` or `STALE`.
- Hero: large condition icon + `40px`-ish temperature + "Overcast · feels like 12°" line (condition description, capitalised, plus feels-like).
- **Condition icon**: replace the OpenWeather `<img>` with a lucide icon mapped from `current.condition.main` (`Clear`→`Sun`, `Clouds`→`Cloud`, `Rain`/`Drizzle`→`CloudRain`, `Thunderstorm`→`CloudLightning`, `Snow`→`CloudSnow`, `Mist`/`Fog`/`Haze`/…→`CloudFog` (haze/atmosphere group), default `Cloud`). Small pure helper + unit test. This matches the mockup's monochrome icon style and drops the external image dependency.
- Stat tiles: a responsive grid of muted tiles (`bg-muted rounded-lg p-3`-style, per mockup) — Wind, Humidity, Feels like. Keep values `tabular-nums`.

**Cache flag plumbing (`lib/api.ts`)**: `getWeather` reads the `x-cache` response header and returns it alongside the DTO — e.g. widen the return to `WeatherResponse & { cache?: "HIT" | "MISS" | "STALE" }` (or a `cache` field on a wrapper type; keep `WeatherResponse` itself matching the API contract). Update `weather.fixtures.ts` accordingly.

**Sidebar cards (`favourites.tsx`, `search-history.tsx`)**: keep all existing behaviour, data flow, and test ids; restyle rows to the mockup's list look — compact rows separated by borders, name left / meta right (history keeps its relative-time on the right, favourites stay name-only), trash affordance on hover as today. Card titles stay icon + label.

**Account chip** (new, `apps/web/src/components/account-chip.tsx`): signed-in only, bottom of the sidebar per the mockup — `Avatar` with initials derived from `session.user.name`, the email, and a small outline "Log out" button calling `authClient.signOut` (no redirect needed — already on `/`). Signed out: render nothing (the header owns the sign-in entry point).

## Step 4 — Auth in a responsive drawer

- New `apps/web/src/components/auth/auth-drawer.tsx` (client): owns `open` state and the sign-in/sign-up mode toggle. Follows the shadcn responsive pattern — `useIsMobile()` from `@weather-app/ui/hooks/use-mobile`; **desktop → `Dialog`** (`sm:max-w-sm`-ish), **mobile → `Drawer`**. Accepts its trigger as a prop/child so both entry points reuse one component:
  1. Header "Sign in" button (Step 2).
  2. The signed-out hint in `search-history.tsx` — currently a `Link href="/login"`; replace with the drawer trigger (keep the same sentence as button text, keep `data-testid="history-signed-out"`).
- Restyle `sign-in-form.tsx` / `sign-up-form.tsx` following the `login-01` block markup (`Field`/`FieldGroup`/`FieldLabel` + validation messages in the field-error slot, full-width submit) — **keep** the TanStack Form + zod + `authClient` logic exactly as-is, minus:
  - the `router.push("/dashboard")` → on success: toast (as today), close the drawer, stay on `/` (session refresh flips the UI to signed-in).
  - the indigo link-button colours → default `Button variant="link"` for the "Need an account? / Already have an account?" mode switch, rendered in the drawer/dialog footer.
  - No SSO section — email/password only.
- Delete `apps/web/src/app/login/` entirely. Grep for remaining `/login` references (`dashboard` is already gone in Step 2; check `proxy.ts`, tests) and remove them.
- Title/description for a11y: `DialogTitle`/`DrawerTitle` "Sign in" / "Create account" per mode.

## Step 5 — Result states (`weather-search.tsx`)

Per the states mockup, all four branches keep their `data-testid`s:

- **Empty (nothing searched)**: keep the `Empty` component — cloud-search-style icon (lucide `CloudSearch` or keep `CloudSun`), "Search for a location", "Try a city name.", plus a small outline **"Try Manchester"** button that calls `onSearchChange("Manchester")` (wire the prop through — it exists).
- **Loading**: update `weather-skeleton.tsx` to mirror the new card layout (circle icon slot, two text lines, tile grid).
- **Not found**: warning-toned `Alert` — lucide `MapPinOff` icon, title `Couldn't find "{search}"`, description "Check the spelling or try a nearby city." shadcn's theme has no warning token; use amber utilities with dark-mode variants (e.g. `border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400`) — acceptable exception to the no-hard-coded-colours rule, matching the mockup's warning tint.
- **Upstream/other error**: destructive `Alert` — `CloudOff` icon, "Weather service unavailable", "Couldn't reach the forecast provider.", Retry button below (existing `query.refetch()` wiring). No "Show cached" button.

## Step 6 — Tests

Update alongside each step (pre-commit runs them all):

- `weather-card.test.tsx`: icon mapping (new helper unit test), "Updated … · cached" line for HIT/STALE vs absent for MISS/undefined, stat tiles render the three metrics.
- `weather-search.test.tsx`: "Try Manchester" triggers a search; not-found and error branches assert the new alert content; loading/empty testids unchanged.
- `favourites.test.tsx` / `search-history.test.tsx`: unchanged behaviour still passes; new chip row (if tested here or in `weather-home.test.tsx`): renders favourites as chips, tap re-runs search, hidden signed-out.
- Auth drawer: new test file — trigger opens (mock `use-mobile` for both branches if cheap, otherwise one), successful sign-in closes the drawer and does not navigate; the history signed-out hint opens the drawer instead of linking to `/login`.
- Delete tests referencing `/dashboard` or the `/login` page, and `user-menu` coverage if any.
- `lib/api.ts` cache-header parsing if `api` has tests (add a small one if trivial).

## Step 7 — Verify + docs

- Run the full stack (`pnpm run db:start`, `pnpm nx dev server`, `pnpm nx dev web`) and check: desktop and mobile widths (chips row, drawer vs dialog), light + dark mode, all four result states (stop the server to force the error state), sign-up → auto-signed-in on `/`, star toggle, favourites/history interactions, log out from the chip.
- `pnpm exec biome check --write .`, `pnpm nx run-many -t test check-types`.
- Update `ARCHITECTURE.md` only if something structural changed worth recording (e.g. "auth is drawer-based on the home page; no /login route"); update `REQUIREMENTS.md` status lines if they reference the dashboard/login pages.
