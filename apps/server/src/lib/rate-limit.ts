import { AppError, ErrorCodes } from "@/lib/errors";

/** Global default: 100 requests per minute per client IP. */
export const RATE_LIMIT_MAX = 100;
export const RATE_LIMIT_TIME_WINDOW_MS = 60_000;

/**
 * `@fastify/rate-limit` *throws* whatever this builder returns, which then
 * flows through the shared error handler. Returning an AppError keeps the
 * 429 response on the standard `{ error: { code, message } }` envelope
 * instead of the plugin's default body. The plugin has already set the
 * `retry-after` / `x-ratelimit-*` headers on the reply by the time it throws.
 */
export function rateLimitErrorResponseBuilder(): AppError {
  return new AppError(429, ErrorCodes.RATE_LIMITED, "Too many requests, please try again shortly.");
}
