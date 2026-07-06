import {
  type ErrorCode,
  ErrorCodes,
  type ErrorEnvelope,
  errorEnvelopeSchema,
} from "@weather-app/schemas/errors";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

// The error contract (codes + envelope schema) lives in @weather-app/schemas
// so the web client derives its types from the same source. Re-exported here
// as the server-side home of everything error-related.
export { type ErrorCode, ErrorCodes, type ErrorEnvelope, errorEnvelopeSchema };

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
