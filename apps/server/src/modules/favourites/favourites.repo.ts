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
 *
 * `sortOrder` is never written here: it stays null until a future manual
 * reorder endpoint writes it. Lists must still respect it (see listForUser)
 * so that endpoint plugs in without touching this interface.
 */
export interface FavouritesRepo {
  /** The user's favourites: `sortOrder ASC NULLS LAST`, then `createdAt ASC`. */
  listForUser(userId: string): Promise<FavouriteRecord[]>;
  /** How many favourites the user has (drives the per-user cap). */
  countForUser(userId: string): Promise<number>;
  /**
   * Insert a favourite. Returns null when the user already has this lat/lon
   * (the `[userId, lat, lon]` unique key) — the caller maps that to 409.
   */
  create(userId: string, favourite: NewFavourite): Promise<FavouriteRecord | null>;
  /**
   * Delete a favourite only if it belongs to `userId`.
   * Returns false when nothing was deleted (missing or not owned).
   */
  deleteOwned(userId: string, id: string): Promise<boolean>;
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
      // Ordering contract: manually ordered rows first (future reorder task),
      // then everything else in creation order.
      orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.favouriteLocation.count({ where: { userId } });
  }

  async create(userId: string, favourite: NewFavourite): Promise<FavouriteRecord | null> {
    try {
      return await this.prisma.favouriteLocation.create({
        data: {
          userId,
          name: favourite.name,
          country: favourite.country,
          state: favourite.state ?? null,
          lat: favourite.lat,
          lon: favourite.lon,
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
}
