import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CACHE_STALE_RETENTION_SECONDS, createSafeCacheStore, PrismaCacheStore } from "@/lib/cache";
import { InMemoryCacheStore, ThrowingCacheStore } from "@/test/fakes";

describe("InMemoryCacheStore (test fake TTL semantics)", () => {
  let nowMs: number;
  let store: InMemoryCacheStore;

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
    store = new InMemoryCacheStore(() => nowMs);
  });

  it("returns a value before its TTL elapses", async () => {
    await store.set("k", { a: 1 }, 60);
    nowMs += 59_999;
    expect(await store.get("k")).toEqual({ a: 1 });
  });

  it("misses at exactly the expiry instant (boundary)", async () => {
    await store.set("k", { a: 1 }, 60);
    nowMs += 60_000;
    expect(await store.get("k")).toBeNull();
  });

  it("getStale returns expired entries", async () => {
    await store.set("k", { a: 1 }, 60);
    nowMs += 3_600_000;
    expect(await store.get("k")).toBeNull();
    expect(await store.getStale("k")).toEqual({ a: 1 });
  });

  it("misses on unknown keys", async () => {
    expect(await store.get("nope")).toBeNull();
    expect(await store.getStale("nope")).toBeNull();
  });
});

describe("createSafeCacheStore", () => {
  it("treats thrown cache errors as misses and logs them", async () => {
    const logError = vi.fn();
    const store = createSafeCacheStore(new ThrowingCacheStore(), logError);

    expect(await store.get("k")).toBeNull();
    expect(await store.getStale("k")).toBeNull();
    await expect(store.set("k", 1, 60)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "get");
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "getStale");
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "set");
  });

  it("passes values through untouched when the store works", async () => {
    const logError = vi.fn();
    const store = createSafeCacheStore(new InMemoryCacheStore(), logError);

    await store.set("k", { a: 1 }, 60);
    expect(await store.get("k")).toEqual({ a: 1 });
    expect(logError).not.toHaveBeenCalled();
  });
});

/**
 * PrismaCacheStore's expiry/retention decision logic, exercised against a
 * stubbed `weatherCache` delegate — no database. Real-DB integration tests
 * are out of scope (documented gap; CI with a service container closes it).
 */
describe("PrismaCacheStore (stubbed Prisma delegate)", () => {
  interface Row {
    key: string;
    payload: unknown;
    expiresAt: Date;
  }

  function createStub() {
    const rows = new Map<string, Row>();
    const prismaStub = {
      weatherCache: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
          return rows.get(where.key) ?? null;
        }),
        upsert: vi.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { key: string };
            create: Row;
            update: Omit<Row, "key">;
          }) => {
            const existing = rows.get(where.key);
            if (existing) {
              rows.set(where.key, { ...existing, ...update });
            } else {
              rows.set(where.key, { ...create });
            }
          },
        ),
        deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
          rows.delete(where.key);
        }),
      },
    };
    // Only the weatherCache delegate is exercised by the store.
    return { rows, prismaStub, store: new PrismaCacheStore(prismaStub as never) };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("set computes expiresAt from the TTL and get returns before expiry", async () => {
    const { store, rows } = createStub();
    await store.set("k", { a: 1 }, 600);
    expect(rows.get("k")?.expiresAt).toEqual(new Date("2026-07-04T12:10:00Z"));
    expect(await store.get("k")).toEqual({ a: 1 });
  });

  it("get misses at expiry but keeps the row for getStale", async () => {
    const { store, prismaStub } = createStub();
    await store.set("k", { a: 1 }, 600);
    vi.advanceTimersByTime(600_000);

    expect(await store.get("k")).toBeNull();
    // Recently expired rows are retained for the stale fallback.
    expect(prismaStub.weatherCache.deleteMany).not.toHaveBeenCalled();
    expect(await store.getStale("k")).toEqual({ a: 1 });
  });

  it("get lazily deletes rows expired beyond the stale-retention window", async () => {
    const { store, prismaStub } = createStub();
    await store.set("k", { a: 1 }, 600);
    vi.advanceTimersByTime(600_000 + CACHE_STALE_RETENTION_SECONDS * 1000);

    expect(await store.get("k")).toBeNull();
    expect(prismaStub.weatherCache.deleteMany).toHaveBeenCalledWith({ where: { key: "k" } });
    expect(await store.getStale("k")).toBeNull();
  });

  it("set upserts over an existing entry", async () => {
    const { store } = createStub();
    await store.set("k", { a: 1 }, 600);
    await store.set("k", { a: 2 }, 600);
    expect(await store.get("k")).toEqual({ a: 2 });
  });
});
