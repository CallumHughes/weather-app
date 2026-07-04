import type { Prisma, PrismaClient } from "@weather-app/db";

/**
 * Minimal TTL key/value store for cached API payloads.
 *
 * Deliberately storage-agnostic: the current implementation sits on a
 * PostgreSQL table (one datastore at this scale), and a Redis-backed
 * implementation is a drop-in swap behind this interface.
 */
export interface CacheStore {
  /** Value for `key`, or null when missing or expired. */
  get<T>(key: string): Promise<T | null>;
  /** Value for `key` even when expired (stale-on-upstream-failure fallback). */
  getStale<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

/**
 * Expired entries are kept around for this long so `getStale` can serve
 * them when upstream fails; only rows expired beyond this window are
 * lazily deleted on read. (Deleting immediately on expiry would defeat
 * the stale-on-upstream-failure fallback.)
 */
export const CACHE_STALE_RETENTION_SECONDS = 24 * 60 * 60;

/**
 * CacheStore on the `weather_cache` table.
 *
 * Expired rows are cleaned up lazily on read (after the stale-retention
 * window); a periodic sweep is a noted future improvement (see
 * ARCHITECTURE.md), not built here.
 */
export class PrismaCacheStore implements CacheStore {
  constructor(private readonly prisma: PrismaClient) {}

  async get<T>(key: string): Promise<T | null> {
    const row = await this.prisma.weatherCache.findUnique({ where: { key } });
    if (!row) {
      return null;
    }
    const now = Date.now();
    if (row.expiresAt.getTime() <= now) {
      if (row.expiresAt.getTime() + CACHE_STALE_RETENTION_SECONDS * 1000 <= now) {
        // Lazy cleanup; deleteMany so a concurrent delete is not an error.
        await this.prisma.weatherCache.deleteMany({ where: { key } });
      }
      return null;
    }
    return row.payload as T;
  }

  async getStale<T>(key: string): Promise<T | null> {
    const row = await this.prisma.weatherCache.findUnique({ where: { key } });
    return row ? (row.payload as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const payload = value as Prisma.InputJsonValue;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.prisma.weatherCache.upsert({
      where: { key },
      create: { key, payload, expiresAt },
      update: { payload, expiresAt },
    });
  }
}

export type CacheErrorLogger = (error: unknown, op: "get" | "getStale" | "set") => void;

/**
 * Wrap a CacheStore so failures never break requests: a thrown cache error
 * is logged and treated as a miss (reads return null, writes are dropped),
 * letting the weather flow proceed to upstream.
 */
export function createSafeCacheStore(store: CacheStore, logError: CacheErrorLogger): CacheStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        return await store.get<T>(key);
      } catch (error) {
        logError(error, "get");
        return null;
      }
    },
    async getStale<T>(key: string): Promise<T | null> {
      try {
        return await store.getStale<T>(key);
      } catch (error) {
        logError(error, "getStale");
        return null;
      }
    },
    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      try {
        await store.set(key, value, ttlSeconds);
      } catch (error) {
        logError(error, "set");
      }
    },
  };
}
