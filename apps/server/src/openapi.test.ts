/**
 * Spec-drift guard: the committed OpenAPI document must always match what the
 * route schemas generate. If this fails, a route/schema changed without
 * regenerating the docs — run `pnpm run docs:generate` from the repo root and
 * commit the result. (Pre-commit runs this suite, standing in for CI.)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildOpenApiSpec, type OpenApiDocument, specToJson } from "@/lib/openapi-spec";

const COMMITTED_SPEC_PATH = path.resolve(
  import.meta.dirname,
  "../../fumadocs/openapi/weather-api.json",
);

async function readCommittedSpec(): Promise<{ raw: string; parsed: OpenApiDocument }> {
  const raw = await readFile(COMMITTED_SPEC_PATH, "utf8");
  return { raw, parsed: JSON.parse(raw) as OpenApiDocument };
}

describe("OpenAPI spec", () => {
  it("committed spec matches the spec generated from the route schemas", async () => {
    const [committed, generated] = await Promise.all([readCommittedSpec(), buildOpenApiSpec()]);

    // Deep object comparison is key-order independent; the exact-bytes check
    // additionally catches formatting drift (hand edits to the generated file).
    expect(generated).toStrictEqual(committed.parsed);
    expect(committed.raw).toBe(specToJson(generated));
  });

  it("documents exactly the public API surface (no auth proxy, no internals)", async () => {
    const spec = await buildOpenApiSpec();
    expect(Object.keys(spec.paths as object).sort()).toEqual([
      "/api/v1/history",
      "/api/v1/history/{id}",
      "/api/v1/weather",
      "/health",
    ]);
  });

  it("contains no secrets and no upstream provider URLs", async () => {
    const text = JSON.stringify(await buildOpenApiSpec()).toLowerCase();
    expect(text).not.toContain("openweathermap");
    expect(text).not.toContain("api_key");
    expect(text).not.toContain("apikey");
    expect(text).not.toContain("secret");
  });

  it("shares the error envelope as a single component", async () => {
    const spec = await buildOpenApiSpec();
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    expect(schemas).toHaveProperty("ErrorEnvelope");
    // Every documented error response references the shared component.
    const weather = (spec.paths as Record<string, Record<string, unknown>>)["/api/v1/weather"]
      ?.get as {
      responses: Record<string, { content?: Record<string, { schema: unknown }> }>;
    };
    expect(weather.responses["404"]?.content?.["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/ErrorEnvelope",
    });
  });

  it("documents the x-cache header on the weather endpoint", async () => {
    const spec = await buildOpenApiSpec();
    const weather = (spec.paths as Record<string, Record<string, unknown>>)["/api/v1/weather"]
      ?.get as {
      responses: Record<string, { headers?: Record<string, { schema: { enum?: string[] } }> }>;
    };
    expect(weather.responses["200"]?.headers?.["x-cache"]?.schema.enum).toEqual([
      "HIT",
      "MISS",
      "STALE",
    ]);
  });
});
