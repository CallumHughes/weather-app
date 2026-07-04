import { auth } from "@weather-app/auth";
import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";

import { AppError, ErrorCodes } from "@/lib/errors";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `requireSession` / `getOptionalSession` when a session resolves. */
    userId?: string;
  }
}

/** The slice of a Better-Auth session the API needs. Injectable for tests. */
export interface SessionInfo {
  user: { id: string };
}

export type SessionResolver = (headers: Headers) => Promise<SessionInfo | null>;

/** Convert Fastify's raw header map to a fetch `Headers` instance. */
export function toWebHeaders(requestHeaders: FastifyRequest["headers"]): Headers {
  const headers = new Headers();
  Object.entries(requestHeaders).forEach(([key, value]) => {
    if (value) headers.append(key, value.toString());
  });
  return headers;
}

/** Default resolver: Better-Auth session lookup from the request headers. */
export const defaultSessionResolver: SessionResolver = async (headers) => {
  const session = await auth.api.getSession({ headers });
  return session ? { user: { id: session.user.id } } : null;
};

/**
 * preHandler guard for protected routes: resolves the Better-Auth session
 * from the request headers and attaches `userId` to the request.
 * No (or unresolvable) session → 401 UNAUTHENTICATED in the standard envelope.
 */
export function createRequireSession(getSession: SessionResolver): preHandlerAsyncHookHandler {
  return async function requireSession(request) {
    let session: SessionInfo | null = null;
    try {
      session = await getSession(toWebHeaders(request.headers));
    } catch (error) {
      request.log.error({ err: error }, "session resolution failed");
    }
    if (!session) {
      throw new AppError(401, ErrorCodes.UNAUTHENTICATED, "You must be signed in to do that.");
    }
    request.userId = session.user.id;
  };
}

/**
 * Optional variant: resolves the session user id if present but never
 * rejects — anonymous (or failed) lookups yield null.
 */
export function createGetOptionalSession(
  getSession: SessionResolver,
): (request: FastifyRequest) => Promise<string | null> {
  return async function getOptionalSession(request) {
    try {
      const session = await getSession(toWebHeaders(request.headers));
      return session?.user.id ?? null;
    } catch (error) {
      request.log.warn({ err: error }, "optional session resolution failed");
      return null;
    }
  };
}
