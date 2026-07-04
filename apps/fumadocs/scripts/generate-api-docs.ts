/**
 * Regenerates the committed API-reference MDX pages in `content/docs/api/`
 * from the committed OpenAPI spec (`openapi/weather-api.json`).
 *
 * Run via `pnpm run docs:generate` at the repo root (regenerates the spec
 * first) or `pnpm --filter fumadocs docs:generate` for the MDX only.
 * Generated files are committed; never edit them by hand. The hand-written
 * `meta.json` in the output directory is preserved.
 */

import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { generateFiles } from "fumadocs-openapi";

import { openapi } from "../src/lib/openapi";

const outputDir = path.resolve(__dirname, "../content/docs/api");

async function main(): Promise<void> {
  // Remove previously generated pages (but keep the hand-written meta.json)
  // so deleted API operations do not leave stale pages behind.
  try {
    for (const file of await readdir(outputDir)) {
      if (file.endsWith(".mdx")) {
        await rm(path.join(outputDir, file));
      }
    }
  } catch {
    // Output directory does not exist yet — generateFiles creates it.
  }

  await generateFiles({
    input: openapi,
    output: outputDir,
    per: "operation",
    includeDescription: true,
  });
}

void main();
