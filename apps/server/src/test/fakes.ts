/**
 * In-memory fakes for route/integration tests. No test needs a running
 * PostgreSQL or a real Better-Auth session: the cache, history storage,
 * and session resolution are all injected via buildApp options.
 */

import type { SessionResolver } from "@/lib/auth-guard";
import type { CacheStore } from "@/lib/cache";
import type { HistoryRecord, HistoryRepo, NewSearch } from "@/modules/history/history.repo";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * CacheStore fake mirroring PrismaCacheStore semantics: `get` misses at or
 * past expiry, `getStale` ignores expiry. The clock is injectable so tests
 * can expire entries without real waiting.
 */
export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) {
      return null;
    }
    return entry.value as T;
  }

  async getStale<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    return entry ? (entry.value as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  /** Force an entry to be expired (but still present for getStale). */
  expire(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      entry.expiresAt = this.now();
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/** CacheStore whose every operation throws — for cache-degradation tests. */
export class ThrowingCacheStore implements CacheStore {
  async get<T>(): Promise<T | null> {
    throw new Error("cache unavailable");
  }

  async getStale<T>(): Promise<T | null> {
    throw new Error("cache unavailable");
  }

  async set(): Promise<void> {
    throw new Error("cache unavailable");
  }
}

/** HistoryRepo fake implementing the same primitives as PrismaHistoryRepo. */
export class InMemoryHistoryRepo implements HistoryRepo {
  readonly rows: HistoryRecord[] = [];
  private nextId = 1;

  /** Seed a row directly (bypasses dedupe/cap — that logic lives in the service). */
  seed(userId: string, search: NewSearch, createdAt: Date): HistoryRecord {
    const record: HistoryRecord = {
      id: `h${this.nextId++}`,
      userId,
      query: search.query,
      resolvedName: search.resolvedName,
      country: search.country,
      state: search.state ?? null,
      lat: search.lat,
      lon: search.lon,
      createdAt,
    };
    this.rows.push(record);
    return record;
  }

  private sortedForUser(userId: string): HistoryRecord[] {
    // Tie-break equal timestamps by insertion order (ids are sequential):
    // tests insert faster than the 1 ms Date resolution.
    return this.rows
      .filter((row) => row.userId === userId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          Number.parseInt(b.id.slice(1), 10) - Number.parseInt(a.id.slice(1), 10),
      );
  }

  async listForUser(userId: string, limit: number): Promise<HistoryRecord[]> {
    return this.sortedForUser(userId).slice(0, limit);
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.id === id && row.userId === userId);
    if (index === -1) {
      return false;
    }
    this.rows.splice(index, 1);
    return true;
  }

  async findLatestForUser(userId: string): Promise<HistoryRecord | null> {
    return this.sortedForUser(userId)[0] ?? null;
  }

  async touch(id: string, query: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) {
      row.query = query;
      row.createdAt = new Date();
    }
  }

  async insert(userId: string, search: NewSearch): Promise<void> {
    this.seed(userId, search, new Date());
  }

  async deleteBeyondNewest(userId: string, keep: number): Promise<void> {
    const excess = this.sortedForUser(userId).slice(keep);
    for (const row of excess) {
      const index = this.rows.indexOf(row);
      this.rows.splice(index, 1);
    }
  }
}

/** Session resolver stub: always the given user (or always anonymous). */
export function stubSession(userId: string | null): SessionResolver {
  return async () => (userId ? { user: { id: userId } } : null);
}
