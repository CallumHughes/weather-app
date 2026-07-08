/**
 * Regenerates the committed API-reference MDX pages in `content/docs/api/`
 * from the committed OpenAPI spec (`openapi/weather-api.json`).
 *
 * Run via `pnpm run docs:generate` at the repo root (regenerates the spec
 * first) or `pnpm --filter fumadocs docs:generate` for the MDX only.
 *
 * Everything under `content/docs/api/` is generated from the spec — the
 * pages, the per-tag folders, and every `meta.json` (including the top-level
 * one). Never edit these by hand; add/adjust operations and `tags` in the
 * Fastify route schemas instead and re-run generation.
 */

import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateFiles } from "fumadocs-openapi";

import { openapi } from "../src/lib/openapi";

const outputDir = path.resolve(__dirname, "../content/docs/api");

async function main(): Promise<void> {
  // Wipe the generated output so deleted operations, tags, or renames do not
  // leave stale pages behind. Everything here is regenerated below.
  await rm(outputDir, { recursive: true, force: true });

  // Group operations into one folder per OpenAPI tag (Weather, History,
  // Favourites, Health) and let fumadocs generate every meta.json, so new
  // operations and tags appear automatically with no hand-maintained files.
  await generateFiles({
    input: openapi,
    output: outputDir,
    per: "operation",
    groupBy: "tag",
    includeDescription: true,
    meta: true,
  });

  // The generated root meta is just `{ pages: [...tags] }`. Enrich it with the
  // section title and open-by-default so the sidebar reads nicely — still
  // fully generated, nothing to maintain by hand.
  const rootMeta = path.join(outputDir, "meta.json");
  const meta = JSON.parse(await readFile(rootMeta, "utf8"));
  await writeFile(
    rootMeta,
    `${JSON.stringify(
      {
        title: "API Reference",
        description: "Generated from the OpenAPI spec",
        defaultOpen: true,
        ...meta,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
