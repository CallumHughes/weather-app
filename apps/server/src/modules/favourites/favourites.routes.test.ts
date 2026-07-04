import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app";
import type { NewFavourite } from "@/modules/favourites/favourites.repo";
import { FAVOURITES_MAX_ENTRIES } from "@/modules/favourites/favourites.service";
import { InMemoryCacheStore, InMemoryFavouritesRepo, stubSession } from "@/test/fakes";

const USER = "user-1";
const OTHER_USER = "user-2";

function favourite(overrides: Partial<NewFavourite> = {}): NewFavourite {
  return {
    name: "London",
    country: "GB",
    state: "England",
    lat: 51.5073219,
    lon: -0.1276474,
    ...overrides,
  };
}

describe("/api/v1/favourites", () => {
  let app: FastifyInstance | undefined;
  let repo: InMemoryFavouritesRepo;

  beforeEach(() => {
    repo = new InMemoryFavouritesRepo();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function buildTestApp(options?: Parameters<typeof buildApp>[0]) {
    app = buildApp({
      logger: false,
      cacheStore: new InMemoryCacheStore(),
      favouritesRepo: repo,
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

  describe("auth guard", () => {
    it("GET /favourites without a session returns 401 in the standard envelope", async () => {
      const response = await (await buildTestApp({ getSession: stubSession(null) })).inject({
        method: "GET",
        url: "/api/v1/favourites",
      });

      expect(response.statusCode).toBe(401);
      expectErrorEnvelope(response.json(), "UNAUTHENTICATED");
    });

    it("POST /favourites without a session returns 401 in the standard envelope", async () => {
      const response = await (await buildTestApp({ getSession: stubSession(null) })).inject({
        method: "POST",
        url: "/api/v1/favourites",
        payload: favourite(),
      });

      expect(response.statusCode).toBe(401);
      expectErrorEnvelope(response.json(), "UNAUTHENTICATED");
    });

    it("DELETE /favourites/:id without a session returns 401 in the standard envelope", async () => {
      const response = await (await buildTestApp({ getSession: stubSession(null) })).inject({
        method: "DELETE",
        url: "/api/v1/favourites/some-id",
      });

      expect(response.statusCode).toBe(401);
      expectErrorEnvelope(response.json(), "UNAUTHENTICATED");
    });
  });

  describe("GET /api/v1/favourites", () => {
    it("returns only the session user's rows", async () => {
      repo.seed(USER, favourite(), new Date(1000));
      repo.seed(OTHER_USER, favourite({ name: "Elsewhere", lat: 1, lon: 1 }), new Date(2000));

      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/favourites",
      });

      expect(response.statusCode).toBe(200);
      const items = response.json();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        name: "London",
        country: "GB",
        state: "England",
        lat: 51.5073219,
        lon: -0.1276474,
        sortOrder: null,
      });
      expect(items[0].createdAt).toBe(new Date(1000).toISOString());
    });

    it("orders by createdAt ascending while no manual order exists (all-null sortOrder)", async () => {
      repo.seed(USER, favourite({ name: "Second", lat: 2, lon: 2 }), new Date(2000));
      repo.seed(USER, favourite({ name: "First", lat: 1, lon: 1 }), new Date(1000));
      repo.seed(USER, favourite({ name: "Third", lat: 3, lon: 3 }), new Date(3000));

      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/favourites",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().map((item: { name: string }) => item.name)).toEqual([
        "First",
        "Second",
        "Third",
      ]);
    });

    it("puts manually ordered rows first, nulls last by createdAt (mixed sortOrder)", async () => {
      // Simulates the state after a future partial reorder: two rows carry a
      // manual position, two newer additions do not.
      repo.seed(USER, favourite({ name: "Unordered old", lat: 1, lon: 1 }), new Date(1000));
      repo.seed(USER, favourite({ name: "Ordered 2nd", lat: 2, lon: 2 }), new Date(4000), 2);
      repo.seed(USER, favourite({ name: "Ordered 1st", lat: 3, lon: 3 }), new Date(5000), 1);
      repo.seed(USER, favourite({ name: "Unordered new", lat: 4, lon: 4 }), new Date(2000));

      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/favourites",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().map((item: { name: string }) => item.name)).toEqual([
        "Ordered 1st",
        "Ordered 2nd",
        "Unordered old",
        "Unordered new",
      ]);
    });

    it("returns an empty list for a user with no favourites", async () => {
      const response = await (await buildTestApp()).inject({
        method: "GET",
        url: "/api/v1/favourites",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe("POST /api/v1/favourites", () => {
    it("saves a favourite and returns 201 with the created row", async () => {
      const response = await (await buildTestApp()).inject({
        method: "POST",
        url: "/api/v1/favourites",
        payload: favourite(),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        id: expect.any(String),
        name: "London",
        country: "GB",
        state: "England",
        lat: 51.5073219,
        lon: -0.1276474,
        sortOrder: null,
        createdAt: expect.any(String),
      });
      expect(repo.rows).toHaveLength(1);
      expect(repo.rows[0]?.userId).toBe(USER);
    });

    it("accepts a favourite without a state", async () => {
      const response = await (await buildTestApp()).inject({
        method: "POST",
        url: "/api/v1/favourites",
        payload: { name: "Paris", country: "FR", lat: 48.85, lon: 2.35 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).not.toHaveProperty("state");
    });

    it("returns 409 ALREADY_FAVOURITE for a duplicate lat/lon", async () => {
      repo.seed(USER, favourite(), new Date());

      const response = await (await buildTestApp()).inject({
        method: "POST",
        url: "/api/v1/favourites",
        payload: favourite(),
      });

      expect(response.statusCode).toBe(409);
      expectErrorEnvelope(response.json(), "ALREADY_FAVOURITE");
      expect(repo.rows).toHaveLength(1);
    });

    it("allows another user to favourite the same coordinates", async () => {
      repo.seed(OTHER_USER, favourite(), new Date());

      const response = await (await buildTestApp()).inject({
        method: "POST",
        url: "/api/v1/favourites",
        payload: favourite(),
      });

      expect(response.statusCode).toBe(201);
      expect(repo.rows).toHaveLength(2);
    });

    it(`returns 400 FAVOURITES_LIMIT_REACHED on favourite ${FAVOURITES_MAX_ENTRIES + 1}`, async () => {
      for (let i = 0; i < FAVOURITES_MAX_ENTRIES; i++) {
        repo.seed(USER, favourite({ name: `City ${i}`, lat: i, lon: i }), new Date(1000 * i));
      }

      const response = await (await buildTestApp()).inject({
        method: "POST",
        url: "/api/v1/favourites",
        payload: favourite({ lat: 99, lon: 99 }),
      });

      expect(response.statusCode).toBe(400);
      expectErrorEnvelope(response.json(), "FAVOURITES_LIMIT_REACHED");
      expect(repo.rows).toHaveLength(FAVOURITES_MAX_ENTRIES);
    });

    it("returns 400 VALIDATION_ERROR for an invalid body", async () => {
      const response = await (await buildTestApp()).inject({
        method: "POST",
        url: "/api/v1/favourites",
        payload: { name: "London", country: "GB" },
      });

      expect(response.statusCode).toBe(400);
      expectErrorEnvelope(response.json(), "VALIDATION_ERROR");
      expect(repo.rows).toHaveLength(0);
    });
  });

  describe("DELETE /api/v1/favourites/:id", () => {
    it("deletes the user's own row and returns 204", async () => {
      const row = repo.seed(USER, favourite(), new Date());
      const testApp = await buildTestApp();

      const response = await testApp.inject({
        method: "DELETE",
        url: `/api/v1/favourites/${row.id}`,
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      expect(repo.rows).toHaveLength(0);

      const list = await testApp.inject({ method: "GET", url: "/api/v1/favourites" });
      expect(list.json()).toEqual([]);
    });

    it("returns 404 for another user's row (ownership is never revealed)", async () => {
      const row = repo.seed(OTHER_USER, favourite(), new Date());

      const response = await (await buildTestApp()).inject({
        method: "DELETE",
        url: `/api/v1/favourites/${row.id}`,
      });

      expect(response.statusCode).toBe(404);
      expectErrorEnvelope(response.json(), "NOT_FOUND");
      expect(repo.rows).toHaveLength(1);
    });

    it("returns 404 for an unknown id", async () => {
      const response = await (await buildTestApp()).inject({
        method: "DELETE",
        url: "/api/v1/favourites/does-not-exist",
      });

      expect(response.statusCode).toBe(404);
      expectErrorEnvelope(response.json(), "NOT_FOUND");
    });
  });
});
