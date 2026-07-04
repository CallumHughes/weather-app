import { createOpenAPI } from "fumadocs-openapi/server";

/**
 * OpenAPI server instance pointing at the committed spec generated from the
 * Fastify route schemas (regenerate with `pnpm run docs:generate` at the
 * repo root). The path is relative to the app directory (`apps/fumadocs`),
 * which is the working directory for both Next.js and the generation script.
 */
export const openapi = createOpenAPI({
  input: ["./openapi/weather-api.json"],
});
