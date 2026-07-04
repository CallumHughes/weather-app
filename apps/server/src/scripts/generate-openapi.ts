/**
 * Regenerates the committed OpenAPI spec at `apps/fumadocs/openapi/weather-api.json`.
 *
 * Run via `pnpm --filter server openapi:generate` (or the root
 * `pnpm run docs:generate`, which also regenerates the Fumadocs MDX pages).
 * Needs no database, network, or real env vars: the app is built with
 * in-memory fakes and `SKIP_ENV_VALIDATION=1`.
 */

// Must be set before `@weather-app/env` is evaluated — hence the dynamic
// import below (static imports would hoist above this assignment).
process.env.SKIP_ENV_VALIDATION ??= "1";

const { mkdir, writeFile } = await import("node:fs/promises");
const path = await import("node:path");
const { buildOpenApiSpec, specToJson } = await import("@/lib/openapi-spec");

const outFile = path.resolve(import.meta.dirname, "../../../fumadocs/openapi/weather-api.json");

const spec = await buildOpenApiSpec();
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, specToJson(spec));

console.log(`OpenAPI spec written to ${path.relative(process.cwd(), outFile)}`);
