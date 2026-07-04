import type { FastifyInstance } from "fastify";
import {
  type Dispatcher,
  getGlobalDispatcher,
  type Interceptable,
  MockAgent,
  setGlobalDispatcher,
} from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app";
import {
  currentWeatherLondonFixture,
  expectedLondonDto,
  geocodeLondonFixture,
} from "@/modules/weather/openweather.fixtures";

const JSON_HEADERS = { "content-type": "application/json" };

describe("GET /api/v1/weather", () => {
  let originalDispatcher: Dispatcher;
  let mockAgent: MockAgent;
  let openWeatherMock: Interceptable;
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    // Intercept undici's global dispatcher (Node's global fetch goes through
    // it) before building the app. disableNetConnect guarantees no test can
    // ever reach the real OpenWeather API.
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    openWeatherMock = mockAgent.get("https://api.openweathermap.org");
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  async function buildTestApp(options?: Parameters<typeof buildApp>[0]) {
    app = buildApp({ logger: false, ...options });
    await app.ready();
    return app;
  }

  function expectErrorEnvelope(body: unknown, code: string) {
    expect(body).toEqual({
      error: {
        code,
        message: expect.any(String),
      },
    });
  }

  it("returns 200 with the mapped DTO on the happy path", async () => {
    openWeatherMock
      .intercept({
        path: "/geo/1.0/direct",
        method: "GET",
        query: { q: "London", limit: "1", appid: "test-api-key" },
      })
      .reply(200, geocodeLondonFixture, { headers: JSON_HEADERS });
    openWeatherMock
      .intercept({
        path: "/data/2.5/weather",
        method: "GET",
        query: {
          lat: "51.5073219",
          lon: "-0.1276474",
          units: "metric",
          appid: "test-api-key",
        },
      })
      .reply(200, currentWeatherLondonFixture, { headers: JSON_HEADERS });

    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "London" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedLondonDto);
  });

  it("returns 400 VALIDATION_ERROR when location is missing", async () => {
    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
    });

    expect(response.statusCode).toBe(400);
    expectErrorEnvelope(response.json(), "VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when location is empty/whitespace", async () => {
    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "   " },
    });

    expect(response.statusCode).toBe(400);
    expectErrorEnvelope(response.json(), "VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when location exceeds 100 characters", async () => {
    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "x".repeat(101) },
    });

    expect(response.statusCode).toBe(400);
    expectErrorEnvelope(response.json(), "VALIDATION_ERROR");
  });

  it("returns 404 LOCATION_NOT_FOUND when geocoding finds nothing", async () => {
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(200, [], { headers: JSON_HEADERS });

    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "Atlantis" },
    });

    expect(response.statusCode).toBe(404);
    expectErrorEnvelope(response.json(), "LOCATION_NOT_FOUND");
  });

  it("returns 502 UPSTREAM_ERROR when OpenWeather responds 500", async () => {
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(500, { message: "internal error" }, { headers: JSON_HEADERS });

    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "London" },
    });

    expect(response.statusCode).toBe(502);
    expectErrorEnvelope(response.json(), "UPSTREAM_ERROR");
  });

  it("returns 502 UPSTREAM_ERROR on a malformed upstream body", async () => {
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(200, geocodeLondonFixture, { headers: JSON_HEADERS });
    openWeatherMock
      .intercept({ path: /^\/data\/2\.5\/weather/, method: "GET" })
      .reply(200, { totally: "unexpected" }, { headers: JSON_HEADERS });

    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "London" },
    });

    expect(response.statusCode).toBe(502);
    expectErrorEnvelope(response.json(), "UPSTREAM_ERROR");
  });

  it("returns 504 UPSTREAM_TIMEOUT when OpenWeather is too slow", async () => {
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(200, geocodeLondonFixture, { headers: JSON_HEADERS })
      .delay(500);

    const response = await (await buildTestApp({ weather: { timeoutMs: 25 } })).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "London" },
    });

    expect(response.statusCode).toBe(504);
    expectErrorEnvelope(response.json(), "UPSTREAM_TIMEOUT");
  });

  it("never leaks the API key or upstream details in error responses", async () => {
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(401, { cod: 401, message: "Invalid API key" }, { headers: JSON_HEADERS });

    const response = await (await buildTestApp()).inject({
      method: "GET",
      url: "/api/v1/weather",
      query: { location: "London" },
    });

    expect(response.statusCode).toBe(502);
    expectErrorEnvelope(response.json(), "UPSTREAM_ERROR");
    expect(response.body).not.toContain("test-api-key");
    expect(response.body).not.toContain("openweathermap");
  });
});
