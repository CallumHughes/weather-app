import fastifyCors from "@fastify/cors";
import { auth } from "@weather-app/auth";
import { env } from "@weather-app/env/server";
import { initLogger } from "evlog";
import { type BetterAuthInstance, createAuthMiddleware } from "evlog/better-auth";
import { evlog, useLogger } from "evlog/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { errorHandler } from "@/lib/errors";
import { OpenWeatherClient } from "@/modules/weather/openweather.client";
import { weatherRoutes } from "@/modules/weather/weather.routes";
import { WeatherService } from "@/modules/weather/weather.service";

const baseCorsConfig = {
  origin: env.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
};

initLogger({
  env: { service: "weather-app-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

export interface BuildAppOptions {
  /** Overrides for the OpenWeather client — injectable for tests. */
  weather?: {
    timeoutMs?: number;
  };
  /** Disable the fastify logger (used by tests to keep output quiet). */
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const fastify = Fastify({
    logger: options.logger ?? true,
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  fastify.setErrorHandler(errorHandler);

  fastify.register(evlog);
  fastify.addHook("preHandler", async (request) => {
    await identifyUser(useLogger(), request.headers, request.url);
  });
  fastify.register(fastifyCors, baseCorsConfig);

  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const headers = new Headers();
        Object.entries(request.headers).forEach(([key, value]) => {
          if (value) headers.append(key, value.toString());
        });
        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined,
        });
        const response = await auth.handler(req);
        reply.status(response.status);
        response.headers.forEach((value, key) => {
          reply.header(key, value);
        });
        reply.send(response.body ? await response.text() : null);
      } catch (error) {
        fastify.log.error({ err: error }, "Authentication Error:");
        reply.status(500).send({
          error: "Internal authentication error",
          code: "AUTH_FAILURE",
        });
      }
    },
  });

  const openWeatherClient = new OpenWeatherClient({
    apiKey: env.OPENWEATHER_API_KEY,
    timeoutMs: options.weather?.timeoutMs,
  });
  const weatherService = new WeatherService(openWeatherClient);

  fastify.register(weatherRoutes, { prefix: "/api/v1", weatherService });

  fastify.get("/", async () => {
    return "OK";
  });

  return fastify;
}
