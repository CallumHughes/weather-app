import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AppError, ErrorCodes, errorEnvelopeSchema } from "@/lib/errors";
import {
  historyDeleteParamsSchema,
  historyListResponseSchema,
} from "@/modules/history/history.schemas";
import type { HistoryService } from "@/modules/history/history.service";

export interface HistoryRoutesOptions {
  historyService: HistoryService;
  requireSession: preHandlerAsyncHookHandler;
}

export async function historyRoutes(
  fastify: FastifyInstance,
  options: HistoryRoutesOptions,
): Promise<void> {
  const { historyService, requireSession } = options;

  // Every route in this plugin requires a session.
  fastify.addHook("preHandler", requireSession);

  /** The guard always sets userId before handlers run; this narrows the type. */
  function sessionUserId(userId: string | undefined): string {
    if (!userId) {
      throw new AppError(401, ErrorCodes.UNAUTHENTICATED, "You must be signed in to do that.");
    }
    return userId;
  }

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/history",
    schema: {
      tags: ["History"],
      summary: "List recent searches",
      description:
        "Returns the signed-in user's most recent weather searches (newest first, at most " +
        "5). Repeat searches of the same location are kept in storage as an audit trail " +
        "but collapsed here to their most recent occurrence, so each location appears at " +
        "most once. Requires a Better-Auth session cookie — see the Authentication page.",
      operationId: "listSearchHistory",
      response: {
        200: historyListResponseSchema,
        401: errorEnvelopeSchema,
        429: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
      responseDocs: {
        200: { description: "The user's recent searches, newest first." },
        401: { description: "No valid session (`UNAUTHENTICATED`)." },
        429: { description: "Rate limit exceeded (`RATE_LIMITED`) — see `retry-after`." },
        500: { description: "Unexpected server error (`INTERNAL_ERROR`)." },
      },
    },
    async handler(request) {
      return historyService.listForUser(sessionUserId(request.userId));
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/history/:id",
    schema: {
      tags: ["History"],
      summary: "Delete a search history entry",
      description:
        "Deletes one of the signed-in user's search history entries. Entries that do not " +
        "exist — or belong to another user — respond 404 (ownership is never revealed). " +
        "Requires a Better-Auth session cookie — see the Authentication page.",
      operationId: "deleteSearchHistoryEntry",
      params: historyDeleteParamsSchema,
      response: {
        // 204: fastify sends no body for 204 responses.
        204: z.null(),
        400: errorEnvelopeSchema,
        401: errorEnvelopeSchema,
        404: errorEnvelopeSchema,
        429: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
      responseDocs: {
        204: { description: "The entry was deleted. No body." },
        400: { description: "Invalid request (`VALIDATION_ERROR`): bad `id` value." },
        401: { description: "No valid session (`UNAUTHENTICATED`)." },
        404: { description: "No such entry for this user (`NOT_FOUND`)." },
        429: { description: "Rate limit exceeded (`RATE_LIMITED`) — see `retry-after`." },
        500: { description: "Unexpected server error (`INTERNAL_ERROR`)." },
      },
    },
    async handler(request, reply) {
      const deleted = await historyService.deleteOwned(
        sessionUserId(request.userId),
        request.params.id,
      );
      if (!deleted) {
        // Missing and not-owned are indistinguishable on purpose: never
        // reveal whether an id exists for another user.
        throw new AppError(404, ErrorCodes.NOT_FOUND, "History entry not found.");
      }
      reply.status(204).send(null);
    },
  });
}
