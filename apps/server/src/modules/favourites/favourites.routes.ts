import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AppError, ErrorCodes, errorEnvelopeSchema } from "@/lib/errors";
import {
  favouriteCreateSchema,
  favouriteDeleteParamsSchema,
  favouriteItemSchema,
  favouritesListResponseSchema,
} from "@/modules/favourites/favourites.schemas";
import type { FavouritesService } from "@/modules/favourites/favourites.service";

export interface FavouritesRoutesOptions {
  favouritesService: FavouritesService;
  requireSession: preHandlerAsyncHookHandler;
}

export async function favouritesRoutes(
  fastify: FastifyInstance,
  options: FavouritesRoutesOptions,
): Promise<void> {
  const { favouritesService, requireSession } = options;

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
    url: "/favourites",
    schema: {
      tags: ["Favourites"],
      summary: "List favourite locations",
      description:
        "Returns the signed-in user's favourite locations. Manually ordered favourites " +
        "come first (`sortOrder` ascending — manual reordering is not exposed yet, so " +
        "`sortOrder` is null for every row today), the rest follow oldest-first. " +
        "Requires a Better-Auth session cookie — see the Authentication page.",
      operationId: "listFavourites",
      response: {
        200: favouritesListResponseSchema,
        401: errorEnvelopeSchema,
        429: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
      responseDocs: {
        200: { description: "The user's favourite locations, ordered as described above." },
        401: { description: "No valid session (`UNAUTHENTICATED`)." },
        429: { description: "Rate limit exceeded (`RATE_LIMITED`) — see `retry-after`." },
        500: { description: "Unexpected server error (`INTERNAL_ERROR`)." },
      },
    },
    async handler(request) {
      return favouritesService.listForUser(sessionUserId(request.userId));
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/favourites",
    schema: {
      tags: ["Favourites"],
      summary: "Save a favourite location",
      description:
        "Saves a resolved location (the `location` object from GET /api/v1/weather) as a " +
        "favourite. Coordinates are the identity: saving the same `lat`/`lon` twice " +
        "responds 409, and each user can hold at most 20 favourites. Requires a " +
        "Better-Auth session cookie — see the Authentication page.",
      operationId: "addFavourite",
      body: favouriteCreateSchema,
      response: {
        201: favouriteItemSchema,
        400: errorEnvelopeSchema,
        401: errorEnvelopeSchema,
        409: errorEnvelopeSchema,
        429: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
      responseDocs: {
        201: { description: "The favourite was saved; the created row is returned." },
        400: {
          description:
            "Invalid body (`VALIDATION_ERROR`) or the 20-favourite cap was hit " +
            "(`FAVOURITES_LIMIT_REACHED`).",
        },
        401: { description: "No valid session (`UNAUTHENTICATED`)." },
        409: { description: "This location is already a favourite (`ALREADY_FAVOURITE`)." },
        429: { description: "Rate limit exceeded (`RATE_LIMITED`) — see `retry-after`." },
        500: { description: "Unexpected server error (`INTERNAL_ERROR`)." },
      },
    },
    async handler(request, reply) {
      const favourite = await favouritesService.add(sessionUserId(request.userId), request.body);
      reply.status(201);
      return favourite;
    },
  });

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/favourites/:id",
    schema: {
      tags: ["Favourites"],
      summary: "Remove a favourite location",
      description:
        "Removes one of the signed-in user's favourites. Favourites that do not exist — " +
        "or belong to another user — respond 404 (ownership is never revealed). " +
        "Requires a Better-Auth session cookie — see the Authentication page.",
      operationId: "deleteFavourite",
      params: favouriteDeleteParamsSchema,
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
        204: { description: "The favourite was removed. No body." },
        400: { description: "Invalid request (`VALIDATION_ERROR`): bad `id` value." },
        401: { description: "No valid session (`UNAUTHENTICATED`)." },
        404: { description: "No such favourite for this user (`NOT_FOUND`)." },
        429: { description: "Rate limit exceeded (`RATE_LIMITED`) — see `retry-after`." },
        500: { description: "Unexpected server error (`INTERNAL_ERROR`)." },
      },
    },
    async handler(request, reply) {
      const deleted = await favouritesService.deleteOwned(
        sessionUserId(request.userId),
        request.params.id,
      );
      if (!deleted) {
        // Missing and not-owned are indistinguishable on purpose: never
        // reveal whether an id exists for another user.
        throw new AppError(404, ErrorCodes.NOT_FOUND, "Favourite not found.");
      }
      reply.status(204).send(null);
    },
  });
}
