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
      response: {
        200: historyListResponseSchema,
        "4xx": errorEnvelopeSchema,
        "5xx": errorEnvelopeSchema,
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
      params: historyDeleteParamsSchema,
      response: {
        // 204: fastify sends no body for 204 responses.
        204: z.null(),
        "4xx": errorEnvelopeSchema,
        "5xx": errorEnvelopeSchema,
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
