/**
 * In-memory fakes for route/integration tests. No test needs a running
 * PostgreSQL or a real Better-Auth session: the cache, history storage,
 * and session resolution are all injected via buildApp options.
 */

import type { SessionResolver } from "@/lib/auth-guard";
import type { CacheStore } from "@/lib/cache";
import type {
  FavouriteRecord,
  FavouritesRepo,
  NewFavourite,
} from "@/modules/favourites/favourites.repo";
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

/** FavouritesRepo fake implementing the same primitives as PrismaFavouritesRepo. */
export class InMemoryFavouritesRepo implements FavouritesRepo {
  readonly rows: FavouriteRecord[] = [];
  private nextId = 1;

  /**
   * Seed a row directly (bypasses the cap/duplicate checks and the
   * create-at-top sortOrder assignment — that logic lives in the service and
   * `create`), so ordering tests can build arbitrary states, legacy null
   * sortOrder rows included.
   */
  seed(
    userId: string,
    favourite: NewFavourite,
    createdAt: Date,
    sortOrder: number | null = null,
  ): FavouriteRecord {
    const record: FavouriteRecord = {
      id: `f${this.nextId++}`,
      userId,
      name: favourite.name,
      country: favourite.country,
      state: favourite.state ?? null,
      lat: favourite.lat,
      lon: favourite.lon,
      sortOrder,
      createdAt,
    };
    this.rows.push(record);
    return record;
  }

  async listForUser(userId: string): Promise<FavouriteRecord[]> {
    // Mirrors the Prisma ordering contract: sortOrder ASC NULLS LAST, then
    // createdAt ASC (insertion-order tie-break for sub-millisecond inserts).
    return this.rows
      .filter((row) => row.userId === userId)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          if (a.sortOrder === null) return 1;
          if (b.sortOrder === null) return -1;
          return a.sortOrder - b.sortOrder;
        }
        return (
          a.createdAt.getTime() - b.createdAt.getTime() ||
          Number.parseInt(a.id.slice(1), 10) - Number.parseInt(b.id.slice(1), 10)
        );
      });
  }

  async countForUser(userId: string): Promise<number> {
    return this.rows.filter((row) => row.userId === userId).length;
  }

  async create(userId: string, favourite: NewFavourite): Promise<FavouriteRecord | null> {
    const duplicate = this.rows.some(
      (row) => row.userId === userId && row.lat === favourite.lat && row.lon === favourite.lon,
    );
    if (duplicate) {
      return null;
    }
    // Mirrors PrismaFavouritesRepo: new favourites go one below the current
    // minimum sortOrder so they list first.
    const sortOrders = this.rows
      .filter((row) => row.userId === userId && row.sortOrder !== null)
      .map((row) => row.sortOrder as number);
    const min = sortOrders.length > 0 ? Math.min(...sortOrders) : 0;
    return this.seed(userId, favourite, new Date(), min - 1);
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.id === id && row.userId === userId);
    if (index === -1) {
      return false;
    }
    this.rows.splice(index, 1);
    return true;
  }

  async setOrder(userId: string, ids: string[]): Promise<void> {
    ids.forEach((id, index) => {
      const row = this.rows.find((candidate) => candidate.id === id && candidate.userId === userId);
      if (row) {
        row.sortOrder = index;
      }
    });
  }
}

/** Session resolver stub: always the given user (or always anonymous). */
export function stubSession(userId: string | null): SessionResolver {
  return async () => (userId ? { user: { id: userId } } : null);
}
