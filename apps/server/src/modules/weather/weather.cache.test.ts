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
import { weatherCacheKey } from "@/modules/weather/weather.constants";
import {
  InMemoryCacheStore,
  InMemoryHistoryRepo,
  stubSession,
  ThrowingCacheStore,
} from "@/test/fakes";

const JSON_HEADERS = { "content-type": "application/json" };
const LONDON_WX_KEY = weatherCacheKey(51.5073219, -0.1276474);

describe("GET /api/v1/weather — caching", () => {
  let originalDispatcher: Dispatcher;
  let mockAgent: MockAgent;
  let openWeatherMock: Interceptable;
  let app: FastifyInstance | undefined;
  /** Mutable clock driving the in-memory cache's expiry checks. */
  let nowMs: number;
  let cache: InMemoryCacheStore;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    // Guarantees a cache HIT can never silently fall through to the network.
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    openWeatherMock = mockAgent.get("https://api.openweathermap.org");
    nowMs = Date.now();
    cache = new InMemoryCacheStore(() => nowMs);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  async function buildTestApp(options?: Parameters<typeof buildApp>[0]) {
    app = buildApp({
      logger: false,
      cacheStore: cache,
      historyRepo: new InMemoryHistoryRepo(),
      getSession: stubSession(null),
      ...options,
    });
    await app.ready();
    return app;
  }

  function mockGeocodeOnce() {
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(200, geocodeLondonFixture, { headers: JSON_HEADERS });
  }

  function mockWeatherOnce() {
    openWeatherMock
      .intercept({ path: /^\/data\/2\.5\/weather/, method: "GET" })
      .reply(200, currentWeatherLondonFixture, { headers: JSON_HEADERS });
  }

  async function search(location = "London") {
    if (!app) throw new Error("app not built");
    return app.inject({ method: "GET", url: "/api/v1/weather", query: { location } });
  }

  it("first call is a MISS, second call is a HIT without touching upstream", async () => {
    // Each interceptor is single-use: a second upstream call would fail the
    // request (net connect is disabled), so a HIT provably skips upstream.
    mockGeocodeOnce();
    mockWeatherOnce();
    await buildTestApp();

    const first = await search();
    expect(first.statusCode).toBe(200);
    expect(first.headers["x-cache"]).toBe("MISS");
    expect(first.json()).toEqual(expectedLondonDto);

    const second = await search();
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(second.json()).toEqual(expectedLondonDto);
    mockAgent.assertNoPendingInterceptors();
  });

  it("nearby queries sharing coordinates hit the same weather entry", async () => {
    mockGeocodeOnce();
    mockWeatherOnce();
    // Different query text, same resolved coordinates: second geocode call
    // still goes upstream (different geo key) but the weather entry is shared.
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(200, geocodeLondonFixture, { headers: JSON_HEADERS });
    await buildTestApp();

    expect((await search("London")).headers["x-cache"]).toBe("MISS");
    const second = await search("London, GB");
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-cache"]).toBe("HIT");
  });

  it("an expired entry is a MISS and refetches from upstream", async () => {
    mockGeocodeOnce();
    mockWeatherOnce();
    await buildTestApp();
    expect((await search()).headers["x-cache"]).toBe("MISS");

    // Past the 10 min weather TTL (geocode's 24 h TTL still holds).
    nowMs += 11 * 60 * 1000;
    mockWeatherOnce();

    const refetched = await search();
    expect(refetched.statusCode).toBe(200);
    expect(refetched.headers["x-cache"]).toBe("MISS");
    mockAgent.assertNoPendingInterceptors();

    // And the refetch re-populated the cache.
    expect((await search()).headers["x-cache"]).toBe("HIT");
  });

  it("serves STALE data when upstream 5xx and an expired entry exists", async () => {
    mockGeocodeOnce();
    mockWeatherOnce();
    await buildTestApp();
    expect((await search()).headers["x-cache"]).toBe("MISS");

    nowMs += 11 * 60 * 1000;
    openWeatherMock
      .intercept({ path: /^\/data\/2\.5\/weather/, method: "GET" })
      .reply(500, { message: "boom" }, { headers: JSON_HEADERS });

    const stale = await search();
    expect(stale.statusCode).toBe(200);
    expect(stale.headers["x-cache"]).toBe("STALE");
    expect(stale.json()).toEqual(expectedLondonDto);
  });

  it("serves STALE data when upstream times out and an expired entry exists", async () => {
    mockGeocodeOnce();
    mockWeatherOnce();
    await buildTestApp({ weather: { timeoutMs: 25 } });
    expect((await search()).headers["x-cache"]).toBe("MISS");

    nowMs += 11 * 60 * 1000;
    openWeatherMock
      .intercept({ path: /^\/data\/2\.5\/weather/, method: "GET" })
      .reply(200, currentWeatherLondonFixture, { headers: JSON_HEADERS })
      .delay(500);

    const stale = await search();
    expect(stale.statusCode).toBe(200);
    expect(stale.headers["x-cache"]).toBe("STALE");
  });

  it("returns 502 when upstream 5xx and no stale entry exists", async () => {
    mockGeocodeOnce();
    openWeatherMock
      .intercept({ path: /^\/data\/2\.5\/weather/, method: "GET" })
      .reply(500, { message: "boom" }, { headers: JSON_HEADERS });
    await buildTestApp();

    const response = await search();
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: { code: "UPSTREAM_ERROR", message: expect.any(String) },
    });
  });

  it("treats a corrupt cached payload as a MISS instead of a 500", async () => {
    await cache.set(LONDON_WX_KEY, { totally: "not-a-weather-dto" }, 600);
    mockGeocodeOnce();
    mockWeatherOnce();
    await buildTestApp();

    const response = await search();
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-cache"]).toBe("MISS");
    expect(response.json()).toEqual(expectedLondonDto);
  });

  it("degrades cache errors to misses without breaking the request", async () => {
    mockGeocodeOnce();
    mockWeatherOnce();
    await buildTestApp({ cacheStore: new ThrowingCacheStore() });

    const response = await search();
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-cache"]).toBe("MISS");
    expect(response.json()).toEqual(expectedLondonDto);
  });
});
