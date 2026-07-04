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
      querystring: weatherQuerySchema,
      response: {
        200: weatherResponseSchema,
        "4xx": errorEnvelopeSchema,
        "5xx": errorEnvelopeSchema,
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
