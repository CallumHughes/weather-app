/**
 * Epic 3 hardening: trustProxy client-IP resolution, per-IP rate limiting,
 * helmet security headers, and the /health endpoint. All dependencies are
 * injected fakes — no PostgreSQL, no network.
 */

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app";
import { InMemoryCacheStore, InMemoryHistoryRepo, stubSession } from "@/test/fakes";

describe("API hardening", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function buildTestApp(options?: Parameters<typeof buildApp>[0]) {
    app = buildApp({
      logger: false,
      cacheStore: new InMemoryCacheStore(),
      historyRepo: new InMemoryHistoryRepo(),
      getSession: stubSession(null),
      health: { dbPing: async () => 1 },
      ...options,
    });
    return app;
  }

  describe("trustProxy", () => {
    it("resolves request.ip from x-forwarded-for (what keys the limiter)", async () => {
      const testApp = buildTestApp();
      // Extra route added before ready(): echoes the resolved client IP.
      testApp.get("/__test/ip", async (request) => ({ ip: request.ip }));
      await testApp.ready();

      const response = await testApp.inject({
        method: "GET",
        url: "/__test/ip",
        headers: { "x-forwarded-for": "203.0.113.7" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ip: "203.0.113.7" });
    });

    it("falls back to the socket address without a forwarded header", async () => {
      const testApp = buildTestApp();
      testApp.get("/__test/ip", async (request) => ({ ip: request.ip }));
      await testApp.ready();

      const response = await testApp.inject({
        method: "GET",
        url: "/__test/ip",
        remoteAddress: "192.0.2.99",
      });

      expect(response.json()).toEqual({ ip: "192.0.2.99" });
    });
  });

  describe("rate limiting", () => {
    it("returns 429 on the standard envelope once the limit is exceeded", async () => {
      const testApp = buildTestApp({ rateLimit: { max: 3 } });
      await testApp.ready();

      for (let i = 0; i < 3; i++) {
        const ok = await testApp.inject({ method: "GET", url: "/" });
        expect(ok.statusCode).toBe(200);
      }

      const limited = await testApp.inject({ method: "GET", url: "/" });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: expect.any(String),
        },
      });
      expect(limited.headers["retry-after"]).toBeDefined();
      expect(limited.headers["x-ratelimit-limit"]).toBeDefined();
      expect(limited.headers["x-ratelimit-remaining"]).toBeDefined();
    });

    it("keeps the envelope on schema-validated routes (weather 4xx schema)", async () => {
      const testApp = buildTestApp({ rateLimit: { max: 1 } });
      await testApp.ready();

      await testApp.inject({ method: "GET", url: "/" });
      // Limiter runs onRequest, before validation/handler — no upstream call.
      const limited = await testApp.inject({
        method: "GET",
        url: "/api/v1/weather",
        query: { location: "London" },
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: { code: "RATE_LIMITED", message: expect.any(String) },
      });
    });

    it("gives each client IP its own bucket", async () => {
      const testApp = buildTestApp({ rateLimit: { max: 1 } });
      await testApp.ready();

      const first = await testApp.inject({
        method: "GET",
        url: "/",
        headers: { "x-forwarded-for": "198.51.100.1" },
      });
      const otherIp = await testApp.inject({
        method: "GET",
        url: "/",
        headers: { "x-forwarded-for": "198.51.100.2" },
      });
      const firstAgain = await testApp.inject({
        method: "GET",
        url: "/",
        headers: { "x-forwarded-for": "198.51.100.1" },
      });

      expect(first.statusCode).toBe(200);
      expect(otherIp.statusCode).toBe(200);
      expect(firstAgain.statusCode).toBe(429);
    });

    it("never limits /health", async () => {
      const testApp = buildTestApp({ rateLimit: { max: 2 } });
      await testApp.ready();

      for (let i = 0; i < 6; i++) {
        const response = await testApp.inject({ method: "GET", url: "/health" });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe("helmet security headers", () => {
    it("adds the default helmet headers to API responses", async () => {
      const testApp = buildTestApp();
      await testApp.ready();

      const response = await testApp.inject({ method: "GET", url: "/api/v1/history" });

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });

    it("covers non-API routes too", async () => {
      const testApp = buildTestApp();
      await testApp.ready();

      const response = await testApp.inject({ method: "GET", url: "/" });

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });
  });

  describe("GET /health", () => {
    it("returns 200 ok when the database ping succeeds", async () => {
      const testApp = buildTestApp({ health: { dbPing: async () => 1 } });
      await testApp.ready();

      const response = await testApp.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });

    it("returns 503 degraded when the ping rejects (not the error envelope)", async () => {
      const testApp = buildTestApp({
        health: {
          dbPing: async () => {
            throw new Error("connection refused");
          },
        },
      });
      await testApp.ready();

      const response = await testApp.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(503);
      // Machine-readable health document — intentionally not { error: ... }.
      expect(response.json()).toEqual({
        status: "degraded",
        checks: { database: "down" },
      });
    });

    it("returns 503 degraded when the ping exceeds the timeout", async () => {
      const testApp = buildTestApp({
        health: {
          dbPing: () => new Promise(() => {}), // hangs forever
          pingTimeoutMs: 20,
        },
      });
      await testApp.ready();

      const response = await testApp.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: "degraded",
        checks: { database: "down" },
      });
    });
  });
});
