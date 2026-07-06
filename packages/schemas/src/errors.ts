import { z } from "zod";

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  NOT_FOUND: "NOT_FOUND",
  LOCATION_NOT_FOUND: "LOCATION_NOT_FOUND",
  ALREADY_FAVOURITE: "ALREADY_FAVOURITE",
  FAVOURITES_LIMIT_REACHED: "FAVOURITES_LIMIT_REACHED",
  FAVOURITES_OUT_OF_SYNC: "FAVOURITES_OUT_OF_SYNC",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Consistent error envelope for every non-2xx response. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z
      .string()
      .describe(
        "Machine-readable error code (VALIDATION_ERROR, UNAUTHENTICATED, NOT_FOUND, LOCATION_NOT_FOUND, ALREADY_FAVOURITE, FAVOURITES_LIMIT_REACHED, FAVOURITES_OUT_OF_SYNC, UPSTREAM_ERROR, UPSTREAM_TIMEOUT, RATE_LIMITED, INTERNAL_ERROR)",
      ),
    message: z.string().describe("Human-readable, client-safe explanation"),
  }),
});

// Registering the envelope in zod's global registry makes
// fastify-type-provider-zod's swagger transforms emit it once as the shared
// `ErrorEnvelope` component (referenced via $ref from every error response)
// instead of inlining it per route. Doc-only: runtime validation/serialization
// is unaffected.
z.globalRegistry.add(errorEnvelopeSchema, {
  id: "ErrorEnvelope",
  description: "Standard error envelope returned by every non-2xx API response.",
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
