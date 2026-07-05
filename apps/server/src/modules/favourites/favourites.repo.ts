import type { PrismaClient } from "@weather-app/db";

/** A stored favourite-location row (storage-level shape). */
export interface FavouriteRecord {
  id: string;
  userId: string;
  name: string;
  country: string;
  state: string | null;
  lat: number;
  lon: number;
  sortOrder: number | null;
  createdAt: Date;
}

/** Payload for saving a favourite — the resolved location from the weather DTO. */
export interface NewFavourite {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
}

/**
 * Primitive storage operations for favourite locations. The cap and duplicate
 * decision logic lives in FavouritesService so it is unit-testable without a
 * database; implementations (Prisma, in-memory test fake) stay dumb.
 */
export interface FavouritesRepo {
  /** The user's favourites: `sortOrder ASC NULLS LAST`, then `createdAt ASC`. */
  listForUser(userId: string): Promise<FavouriteRecord[]>;
  /** How many favourites the user has (drives the per-user cap). */
  countForUser(userId: string): Promise<number>;
  /**
   * Insert a favourite at the top of the list: it gets a `sortOrder` below
   * every existing row (non-null sorts before null, so it also precedes rows
   * that have never been reordered). Returns null when the user already has
   * this lat/lon (the `[userId, lat, lon]` unique key) — the caller maps that
   * to 409.
   */
  create(userId: string, favourite: NewFavourite): Promise<FavouriteRecord | null>;
  /**
   * Delete a favourite only if it belongs to `userId`.
   * Returns false when nothing was deleted (missing or not owned).
   */
  deleteOwned(userId: string, id: string): Promise<boolean>;
  /**
   * Persist a manual order: `sortOrder` = position of the id in `ids`.
   * Ids not owned by `userId` are ignored (the service validates the set
   * matches beforehand). Applied atomically.
   */
  setOrder(userId: string, ids: string[]): Promise<void>;
}

/** Prisma unique-constraint violation (duplicate `[userId, lat, lon]`). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export class PrismaFavouritesRepo implements FavouritesRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async listForUser(userId: string): Promise<FavouriteRecord[]> {
    return this.prisma.favouriteLocation.findMany({
      where: { userId },
      // Ordering contract: ordered rows first (new favourites are created at
      // the top; reorders rewrite positions), then any legacy null-sortOrder
      // rows in creation order.
      orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.favouriteLocation.count({ where: { userId } });
  }

  async create(userId: string, favourite: NewFavourite): Promise<FavouriteRecord | null> {
    try {
      // New favourites go to the top: one below the current minimum. Legacy
      // null-sortOrder rows sort after any non-null value, so `min ?? 0` is
      // safe for them too. Concurrent adds can tie — createdAt breaks the tie
      // and the next reorder normalises positions to 0..n-1.
      const { _min } = await this.prisma.favouriteLocation.aggregate({
        where: { userId },
        _min: { sortOrder: true },
      });
      return await this.prisma.favouriteLocation.create({
        data: {
          userId,
          name: favourite.name,
          country: favourite.country,
          state: favourite.state ?? null,
          lat: favourite.lat,
          lon: favourite.lon,
          sortOrder: (_min.sortOrder ?? 0) - 1,
        },
      });
    } catch (error) {
      // The DB-enforced unique key is the source of truth for duplicates —
      // no read-then-write race.
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    // Filtered by owner: zero rows affected means "missing or someone
    // else's" — the caller maps both to 404 without revealing which.
    const result = await this.prisma.favouriteLocation.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async setOrder(userId: string, ids: string[]): Promise<void> {
    // Owner-filtered updates inside a transaction: a foreign id updates zero
    // rows and the whole order is applied atomically.
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.favouriteLocation.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}
