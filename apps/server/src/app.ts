import fastifyCors from "@fastify/cors";
import { auth } from "@weather-app/auth";
import prisma from "@weather-app/db";
import { env } from "@weather-app/env/server";
import { initLogger } from "evlog";
import { type BetterAuthInstance, createAuthMiddleware } from "evlog/better-auth";
import { evlog, useLogger } from "evlog/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import {
  createGetOptionalSession,
  createRequireSession,
  defaultSessionResolver,
  type SessionResolver,
  toWebHeaders,
} from "@/lib/auth-guard";
import { type CacheStore, createSafeCacheStore, PrismaCacheStore } from "@/lib/cache";
import { errorHandler } from "@/lib/errors";
import type { HistoryRepo } from "@/modules/history/history.repo";
import { PrismaHistoryRepo } from "@/modules/history/history.repo";
import { historyRoutes } from "@/modules/history/history.routes";
import { HistoryService } from "@/modules/history/history.service";
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
  /** Cache backend — injectable for tests (defaults to PrismaCacheStore). */
  cacheStore?: CacheStore;
  /** History storage — injectable for tests (defaults to PrismaHistoryRepo). */
  historyRepo?: HistoryRepo;
  /** Session resolution — injectable for tests (defaults to Better-Auth). */
  getSession?: SessionResolver;
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
        const req = new Request(url.toString(), {
          method: request.method,
          headers: toWebHeaders(request.headers),
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

  // Cache failures must never break requests: the safe wrapper logs and
  // degrades every cache error to a miss (applies to injected stores too).
  const cacheStore = createSafeCacheStore(
    options.cacheStore ?? new PrismaCacheStore(prisma),
    (error, op) => {
      fastify.log.error({ err: error, op }, "cache store operation failed");
    },
  );

  const getSession = options.getSession ?? defaultSessionResolver;
  const requireSession = createRequireSession(getSession);
  const getOptionalSession = createGetOptionalSession(getSession);

  const historyRepo = options.historyRepo ?? new PrismaHistoryRepo(prisma);
  const historyService = new HistoryService(historyRepo);

  const openWeatherClient = new OpenWeatherClient({
    apiKey: env.OPENWEATHER_API_KEY,
    timeoutMs: options.weather?.timeoutMs,
  });
  const weatherService = new WeatherService(openWeatherClient, cacheStore);

  fastify.register(weatherRoutes, {
    prefix: "/api/v1",
    weatherService,
    historyService,
    getOptionalSession,
  });
  fastify.register(historyRoutes, { prefix: "/api/v1", historyService, requireSession });

  fastify.get("/", async () => {
    return "OK";
  });

  return fastify;
}
