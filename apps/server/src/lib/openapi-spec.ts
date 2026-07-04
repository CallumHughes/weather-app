/**
 * Builds the OpenAPI document in-memory, with injectable fakes for every
 * external dependency — no database, no network, no real env. Shared by the
 * generation script (`src/scripts/generate-openapi.ts`) and the spec-drift
 * test (`src/openapi.test.ts`) so both always produce the spec the same way.
 */

import { buildApp } from "@/app";
import { InMemoryCacheStore, InMemoryHistoryRepo, stubSession } from "@/test/fakes";

/** JSON object shape of the generated OpenAPI document. */
export type OpenApiDocument = Record<string, unknown>;

/**
 * Component schemas that exist only as registry artifacts: the zod transforms
 * emit an `<id>Input` variant for every registered schema, but the error
 * envelope is used exclusively in responses (output), so its input variant is
 * never referenced. Dropped to keep the committed spec free of dead entries.
 */
const UNREFERENCED_COMPONENTS = ["ErrorEnvelopeInput"];

export async function buildOpenApiSpec(): Promise<OpenApiDocument> {
  const app = buildApp({
    logger: false,
    cacheStore: new InMemoryCacheStore(),
    historyRepo: new InMemoryHistoryRepo(),
    getSession: stubSession(null),
    health: { dbPing: async () => 1 },
  });

  try {
    await app.ready();
    // Deep-clone via JSON round-trip: `app.swagger()` returns live internal
    // state, and the round-trip also guarantees the object is plain JSON.
    const spec = JSON.parse(JSON.stringify(app.swagger())) as OpenApiDocument;

    const schemas = (spec.components as { schemas?: Record<string, unknown> } | undefined)?.schemas;
    if (schemas) {
      for (const name of UNREFERENCED_COMPONENTS) {
        if (!JSON.stringify(spec).includes(`#/components/schemas/${name}"`)) {
          delete schemas[name];
        }
      }
    }

    return spec;
  } finally {
    await app.close();
  }
}

/** Serialises the spec exactly as committed: pretty-printed + trailing newline. */
export function specToJson(spec: OpenApiDocument): string {
  return `${JSON.stringify(spec, null, 2)}\n`;
}
