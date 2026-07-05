import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
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

/**
 * Operational error with a client-safe message. Anything thrown as an
 * AppError is returned to the client as-is (status + code + message);
 * everything else is masked as a generic 500 INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(statusCode: number, code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

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

function envelope(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

/**
 * Shared error handler: maps every error to the consistent
 * `{ error: { code, message } }` envelope.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    }
    reply.status(error.statusCode).send(envelope(error.code, error.message));
    return;
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const details = error.validation
      .map((issue) => {
        const field = issue.instancePath.replace(/^\//, "") || "query";
        return `${field}: ${issue.message ?? "invalid value"}`;
      })
      .join("; ");
    reply.status(400).send(envelope(ErrorCodes.VALIDATION_ERROR, `Invalid request: ${details}`));
    return;
  }

  // Fastify's own validation errors (e.g. missing required querystring keys)
  if (error.statusCode === 400 && error.code?.startsWith("FST_ERR_VALIDATION")) {
    reply
      .status(400)
      .send(envelope(ErrorCodes.VALIDATION_ERROR, `Invalid request: ${error.message}`));
    return;
  }

  request.log.error({ err: error }, "unhandled error");
  reply.status(500).send(envelope(ErrorCodes.INTERNAL_ERROR, "Something went wrong."));
}
