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
import type { NewSearch } from "@/modules/history/history.repo";
import {
  currentWeatherLondonFixture,
  geocodeLondonFixture,
} from "@/modules/weather/openweather.fixtures";
import { InMemoryCacheStore, InMemoryHistoryRepo, stubSession } from "@/test/fakes";

const JSON_HEADERS = { "content-type": "application/json" };
const USER = "user-1";
const OTHER_USER = "user-2";

function search(overrides: Partial<NewSearch> = {}): NewSearch {
  return {
    query: "London",
    resolvedName: "London",
    country: "GB",
    state: "England",
    lat: 51.51,
    lon: -0.13,
    ...overrides,
  };
}

describe("/api/v1/history", () => {
  let originalDispatcher: Dispatcher;
  let mockAgent: MockAgent;
  let openWeatherMock: Interceptable;
  let app: FastifyInstance | undefined;
  let repo: InMemoryHistoryRepo;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    openWeatherMock = mockAgent.get("https://api.openweathermap.org");
    repo = new InMemoryHistoryRepo();
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
      cacheStore: new InMemoryCacheStore(),
      historyRepo: repo,
      getSession: stubSession(USER),
      ...options,
    });
    await app.ready();
    return app;
  }

  function expectErrorEnvelope(body: unknown, code: string) {
    expect(body).toEqual({
      error: { code, message: expect.any(String) },
    });
  }

  function mockLondonUpstream() {
    openWeatherMock
      .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
      .reply(200, geocodeLondonFixture, { headers: JSON_HEADERS });
    openWeatherMock
      .intercept({ path: /^\/data\/2\.5\/weather/, method: "GET" })
      .reply(200, currentWeatherLondonFixture, { headers: JSON_HEADERS });
  }

  describe("auth guard", () => {
    it("GET /history without a session returns 401 in the standard envelope", async () => {
      const response = await (await buildTestApp({ getSession: stubSession(null) })).inject({
        method: "GET",
        url: "/api/v1/history",
      });

      expect(response.statusCode).toBe(401);
      expectErrorEnvelope(response.json(), "UNAUTHENTICATED");
    });

    it("DELETE /history/:id without a session returns 401 in the standard envelope", async () => {
      const response = await (await buildTestApp({ getSession: stubSession(null) })).inject({
        method: "DELETE",
        url: "/api/v1/history/some-id",
      });

      expect(response.statusCode).toBe(401);
      expectErrorEnvelope(response.json(), "UNAUTHENTICATED");
    });

    it("returns 401 when session resolution throws", async () => {
      const response = await (
        await buildTestApp({
          getSession: async () => {
            throw new Error("auth backend down");
          },
        })
      ).inject({ method: "GET", url: "/api/v1/history" });

      expect(response.statusCode).toBe(401);
      expectErrorEnvelope(response.json(), "UNAUTHENTICATED");
    });
  });

  describe("GET /api/v1/history", () => {
    it("returns only the session user's rows, newest first, capped at 5", async () => {
      for (let i = 0; i < 7; i++) {
        repo.seed(USER, search({ resolvedName: `City ${i}`, lat: i, lon: i }), new Date(1000 * i));
      }
      repo.seed(OTHER_USER, search({ resolvedName: "Elsewhere" }), new Date());

      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/history",
      });

      expect(response.statusCode).toBe(200);
      const items = response.json();
      expect(items).toHaveLength(5);
      expect(items[0]).toMatchObject({
        resolvedName: "City 6",
        country: "GB",
        state: "England",
        query: "London",
      });
      expect(items[0].createdAt).toBe(new Date(6000).toISOString());
      expect(items.map((item: { resolvedName: string }) => item.resolvedName)).not.toContain(
        "Elsewhere",
      );
    });

    it("returns an empty list for a user with no history", async () => {
      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/history",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe("DELETE /api/v1/history/:id", () => {
    it("deletes the user's own row and returns 204", async () => {
      const row = repo.seed(USER, search(), new Date());
      const testApp = await buildTestApp();

      const response = await testApp.inject({
        method: "DELETE",
        url: `/api/v1/history/${row.id}`,
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      expect(repo.rows).toHaveLength(0);

      const list = await testApp.inject({ method: "GET", url: "/api/v1/history" });
      expect(list.json()).toEqual([]);
    });

    it("returns 404 for another user's row (ownership is never revealed)", async () => {
      const row = repo.seed(OTHER_USER, search(), new Date());

      const response = await (await buildTestApp()).inject({
        method: "DELETE",
        url: `/api/v1/history/${row.id}`,
      });

      expect(response.statusCode).toBe(404);
      expectErrorEnvelope(response.json(), "NOT_FOUND");
      expect(repo.rows).toHaveLength(1);
    });

    it("returns 404 for an unknown id", async () => {
      const response = await (await buildTestApp()).inject({
        method: "DELETE",
        url: "/api/v1/history/does-not-exist",
      });

      expect(response.statusCode).toBe(404);
      expectErrorEnvelope(response.json(), "NOT_FOUND");
    });
  });

  describe("recording via GET /api/v1/weather", () => {
    it("records a successful search for a signed-in user", async () => {
      mockLondonUpstream();
      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/weather",
        query: { location: "London" },
      });

      expect(response.statusCode).toBe(200);
      expect(repo.rows).toHaveLength(1);
      expect(repo.rows[0]).toMatchObject({
        userId: USER,
        query: "London",
        resolvedName: "London",
        country: "GB",
        state: "England",
        lat: 51.5073219,
        lon: -0.1276474,
      });
    });

    it("records nothing for anonymous searches", async () => {
      mockLondonUpstream();
      const response = await (await buildTestApp({ getSession: stubSession(null) })).inject({
        method: "GET",
        url: "/api/v1/weather",
        query: { location: "London" },
      });

      expect(response.statusCode).toBe(200);
      expect(repo.rows).toHaveLength(0);
    });

    it("records nothing when the search fails", async () => {
      openWeatherMock
        .intercept({ path: /^\/geo\/1\.0\/direct/, method: "GET" })
        .reply(200, [], { headers: JSON_HEADERS });

      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/weather",
        query: { location: "Atlantis" },
      });

      expect(response.statusCode).toBe(404);
      expect(repo.rows).toHaveLength(0);
    });

    it("dedupes a consecutive repeat search (updates timestamp and query, no new row)", async () => {
      mockLondonUpstream();
      const testApp = await buildTestApp();

      const first = await testApp.inject({
        method: "GET",
        url: "/api/v1/weather",
        query: { location: "London" },
      });
      expect(first.statusCode).toBe(200);
      const firstCreatedAt = repo.rows[0]?.createdAt.getTime() ?? 0;

      await new Promise((resolve) => setTimeout(resolve, 5));
      // Second search normalises to the same geocode key → served from
      // cache, still recorded, deduped into the existing row.
      const second = await testApp.inject({
        method: "GET",
        url: "/api/v1/weather",
        query: { location: "  london " },
      });
      expect(second.statusCode).toBe(200);

      expect(repo.rows).toHaveLength(1);
      expect(repo.rows[0]?.query).toBe("london");
      expect(repo.rows[0]?.createdAt.getTime()).toBeGreaterThan(firstCreatedAt);
    });

    it("does not fail the weather response when recording throws", async () => {
      mockLondonUpstream();
      repo.findLatestForUser = async () => {
        throw new Error("db down");
      };

      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/weather",
        query: { location: "London" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-cache"]).toBe("MISS");
    });
  });
});
