import type { PrismaClient } from "@weather-app/db";

/** A stored search-history row (storage-level shape). */
export interface HistoryRecord {
  id: string;
  userId: string;
  query: string;
  resolvedName: string;
  country: string;
  state: string | null;
  lat: number;
  lon: number;
  createdAt: Date;
}

/** Payload for recording a successful search. */
export interface NewSearch {
  query: string;
  resolvedName: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
}

/**
 * Primitive storage operations for search history. The dedupe and cap
 * decision logic lives in HistoryService so it is unit-testable without a
 * database; implementations (Prisma, in-memory test fake) stay dumb.
 */
export interface HistoryRepo {
  /** The user's most recent entries, newest first. */
  listForUser(userId: string, limit: number): Promise<HistoryRecord[]>;
  /**
   * Delete an entry only if it belongs to `userId`.
   * Returns false when nothing was deleted (missing or not owned).
   */
  deleteOwned(userId: string, id: string): Promise<boolean>;
  /** The user's single most recent entry, if any. */
  findLatestForUser(userId: string): Promise<HistoryRecord | null>;
  /** Refresh an entry in place: bump `createdAt` to now and update the raw query. */
  touch(id: string, query: string): Promise<void>;
  insert(userId: string, search: NewSearch): Promise<void>;
  /** Delete the user's rows beyond the newest `keep`. */
  deleteBeyondNewest(userId: string, keep: number): Promise<void>;
}

export class PrismaHistoryRepo implements HistoryRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async listForUser(userId: string, limit: number): Promise<HistoryRecord[]> {
    return this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    // Filtered by owner: zero rows affected means "missing or someone
    // else's" — the caller maps both to 404 without revealing which.
    const result = await this.prisma.searchHistory.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async findLatestForUser(userId: string): Promise<HistoryRecord | null> {
    return this.prisma.searchHistory.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async touch(id: string, query: string): Promise<void> {
    await this.prisma.searchHistory.update({
      where: { id },
      data: { query, createdAt: new Date() },
    });
  }

  async insert(userId: string, search: NewSearch): Promise<void> {
    await this.prisma.searchHistory.create({
      data: {
        userId,
        query: search.query,
        resolvedName: search.resolvedName,
        country: search.country,
        state: search.state ?? null,
        lat: search.lat,
        lon: search.lon,
      },
    });
  }

  async deleteBeyondNewest(userId: string, keep: number): Promise<void> {
    const excess = await this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: keep,
      select: { id: true },
    });
    if (excess.length > 0) {
      await this.prisma.searchHistory.deleteMany({
        where: { id: { in: excess.map((row) => row.id) } },
      });
    }
  }
}
