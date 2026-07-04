/**
 * OpenAPI document configuration for `@fastify/swagger`.
 *
 * The spec is derived from the real zod route schemas (via
 * fastify-type-provider-zod's transforms) so documentation cannot drift from
 * the implementation. The server never exposes a live docs UI — the committed
 * spec is rendered by the Fumadocs app (`apps/fumadocs`).
 */

import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";
import { jsonSchemaTransform, jsonSchemaTransformObject } from "fastify-type-provider-zod";

/** JSON-schema fragment for a documented response header. */
interface ResponseHeaderDoc {
  type: string;
  enum?: string[];
  description?: string;
}

/** Doc-only additions for a single response status code. */
interface ResponseDoc {
  description?: string;
  headers?: Record<string, ResponseHeaderDoc>;
}

declare module "fastify" {
  interface FastifySchema {
    /**
     * Doc-only response metadata (per status code): OpenAPI response
     * descriptions and response headers. Stripped from the route schema by
     * {@link openApiTransform} before the spec is built — never used at
     * runtime for validation or serialization.
     */
    responseDocs?: Record<string, ResponseDoc>;
  }
}

/**
 * Wraps fastify-type-provider-zod's `jsonSchemaTransform` to merge the
 * `responseDocs` carrier into the transformed JSON schema: response
 * descriptions become `x-response-description` (which `@fastify/swagger`
 * maps to the OpenAPI response `description`) and response headers are
 * attached where `@fastify/swagger` picks them up (`schema.response[code].headers`).
 */
const openApiTransform: NonNullable<FastifyDynamicSwaggerOptions["transform"]> = (data) => {
  const transformed = jsonSchemaTransform(data);
  const schema = transformed.schema as Record<string, unknown> | undefined;
  if (!schema || !("responseDocs" in schema)) {
    return transformed;
  }

  const responseDocs = schema.responseDocs as Record<string, ResponseDoc>;
  delete schema.responseDocs;
  const responses = schema.response as Record<string, Record<string, unknown>> | undefined;
  for (const [statusCode, doc] of Object.entries(responseDocs)) {
    const response = responses?.[statusCode];
    if (!response) {
      continue;
    }
    if (doc.description) {
      // `@fastify/swagger` reads `x-response-description` from resolved
      // inline schemas but only a sibling `description` from `$ref` entries
      // (shared components like the error envelope).
      if ("$ref" in response) {
        response.description = doc.description;
      } else {
        response["x-response-description"] = doc.description;
      }
    }
    if (doc.headers) {
      response.headers = doc.headers;
    }
  }
  return transformed;
};

/**
 * `@fastify/swagger` registration options. Registered in `buildApp()`; the
 * document is only materialised when `app.swagger()` is called (the
 * generation script and the spec-drift test).
 */
export const openApiOptions: FastifyDynamicSwaggerOptions = {
  openapi: {
    openapi: "3.1.0",
    info: {
      title: "Weather App API",
      version: "1.0.0",
      description:
        "REST API for current weather by location and per-user search history.\n\n" +
        "Base URL model: in production the API is served same-origin under `/api/*` " +
        "via the Next.js BFF reverse proxy (session cookies stay first-party); in local " +
        "development the Fastify server is reached directly at `http://localhost:3000`.\n\n" +
        "All non-2xx responses use the shared `ErrorEnvelope` shape. Authentication " +
        "endpoints under `/api/auth/*` are handled by Better-Auth and are documented " +
        "separately (see the Authentication page).",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development (Fastify directly)",
      },
      {
        url: "/",
        description: "Production (same-origin via the Next.js BFF proxy)",
      },
    ],
    tags: [
      { name: "Weather", description: "Current weather lookups" },
      { name: "History", description: "Per-user search history (requires a session)" },
      { name: "Health", description: "Service health for infrastructure probes" },
    ],
  },
  transform: openApiTransform,
  transformObject: jsonSchemaTransformObject,
};
