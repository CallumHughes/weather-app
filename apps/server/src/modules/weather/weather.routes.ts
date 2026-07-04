import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { errorEnvelopeSchema } from "@/lib/errors";
import type { HistoryService } from "@/modules/history/history.service";
import { weatherQuerySchema, weatherResponseSchema } from "@/modules/weather/weather.schemas";
import type { WeatherService } from "@/modules/weather/weather.service";

export interface WeatherRoutesOptions {
  weatherService: WeatherService;
  historyService: HistoryService;
  /** Resolves the session user id if present; never rejects. */
  getOptionalSession: (request: FastifyRequest) => Promise<string | null>;
}

export async function weatherRoutes(
  fastify: FastifyInstance,
  options: WeatherRoutesOptions,
): Promise<void> {
  const { weatherService, historyService, getOptionalSession } = options;

  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/weather",
    schema: {
      tags: ["Weather"],
      summary: "Get current weather for a location",
      description:
        "Resolves a free-text location (city name, optionally with country/state) via " +
        "geocoding and returns the current weather. Responses are served from a server-side " +
        "cache where possible — the `x-cache` response header reports the outcome: `HIT` " +
        "(served from cache), `MISS` (fetched upstream) or `STALE` (upstream failed, an " +
        "expired cache entry was served instead). When a signed-in session cookie is sent, " +
        "the successful search is recorded in the user's search history; anonymous searches " +
        "are never stored.",
      operationId: "getCurrentWeather",
      querystring: weatherQuerySchema,
      response: {
        200: weatherResponseSchema,
        400: errorEnvelopeSchema,
        404: errorEnvelopeSchema,
        429: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
        502: errorEnvelopeSchema,
        504: errorEnvelopeSchema,
      },
      responseDocs: {
        200: {
          description: "Current weather for the resolved location.",
          headers: {
            "x-cache": {
              type: "string",
              enum: ["HIT", "MISS", "STALE"],
              description:
                "Cache outcome: HIT — served from the weather cache; MISS — fetched " +
                "upstream; STALE — upstream failed, an expired cache entry was served instead.",
            },
          },
        },
        400: { description: "Invalid request (`VALIDATION_ERROR`): bad `location` value." },
        404: { description: "No place matched the query (`LOCATION_NOT_FOUND`)." },
        429: { description: "Rate limit exceeded (`RATE_LIMITED`) — see `retry-after`." },
        500: { description: "Unexpected server error (`INTERNAL_ERROR`)." },
        502: { description: "The upstream weather provider failed (`UPSTREAM_ERROR`)." },
        504: { description: "The upstream weather provider timed out (`UPSTREAM_TIMEOUT`)." },
      },
    },
    async handler(request, reply) {
      const location = request.query.location;
      const { data, cache } = await weatherService.getCurrentWeather(location);
      reply.header("x-cache", cache);

      // Record the search for signed-in users. Anonymous searches are never
      // recorded, and recording failures must never fail the weather
      // response — log and continue.
      const userId = await getOptionalSession(request);
      if (userId) {
        try {
          await historyService.record(userId, {
            query: location,
            resolvedName: data.location.name,
            country: data.location.country,
            ...(data.location.state !== undefined && { state: data.location.state }),
            lat: data.location.lat,
            lon: data.location.lon,
          });
        } catch (error) {
          request.log.error({ err: error }, "failed to record search history");
        }
      }

      return data;
    },
  });
}
