import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  errorEnvelopeSchema,
  weatherQuerySchema,
  weatherResponseSchema,
} from "@/modules/weather/weather.schemas";
import type { WeatherService } from "@/modules/weather/weather.service";

export interface WeatherRoutesOptions {
  weatherService: WeatherService;
}

export async function weatherRoutes(
  fastify: FastifyInstance,
  options: WeatherRoutesOptions,
): Promise<void> {
  const { weatherService } = options;

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
    async handler(request) {
      return weatherService.getCurrentWeather(request.query.location);
    },
  });
}
