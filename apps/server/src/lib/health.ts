import type { FastifyInstance } from "fastify";

/** The DB ping must answer well within a health-poll interval. */
export const HEALTH_DB_PING_TIMEOUT_MS = 2_000;

/** Cheap database liveness probe (`SELECT 1` in production). */
export type DbPing = () => Promise<unknown>;

export interface HealthRoutesOptions {
  dbPing: DbPing;
  /** Injectable for tests; defaults to {@link HEALTH_DB_PING_TIMEOUT_MS}. */
  pingTimeoutMs?: number;
}

/**
 * `GET /health` — machine-readable health document for Docker/Railway
 * health checks. Deliberately *not* on the `{ error: { code, message } }`
 * envelope: a 503 here describes service state for infrastructure, not a
 * client error. Exempt from rate limiting because it is polled frequently.
 */
export async function healthRoutes(
  fastify: FastifyInstance,
  options: HealthRoutesOptions,
): Promise<void> {
  const timeoutMs = options.pingTimeoutMs ?? HEALTH_DB_PING_TIMEOUT_MS;

  fastify.get("/health", { config: { rateLimit: false } }, async (request, reply) => {
    if (await isDatabaseUp(options.dbPing, timeoutMs)) {
      return { status: "ok" };
    }
    request.log.warn("health check: database ping failed or timed out");
    reply.status(503);
    return { status: "degraded", checks: { database: "down" } };
  });
}

async function isDatabaseUp(ping: DbPing, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const pingPromise = ping();
    // A ping that settles after losing the race must not become an
    // unhandled rejection.
    pingPromise.catch(() => {});
    await Promise.race([
      pingPromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("health db ping timed out")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
