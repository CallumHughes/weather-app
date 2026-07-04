import { AppError, ErrorCodes } from "@/lib/errors";
import type {
  FavouriteRecord,
  FavouritesRepo,
  NewFavourite,
} from "@/modules/favourites/favourites.repo";
import type { FavouriteItem } from "@/modules/favourites/favourites.schemas";

/** Per-user cap: adding beyond it is rejected (unlike history's evict-oldest). */
export const FAVOURITES_MAX_ENTRIES = 20;

function toFavouriteItem(record: FavouriteRecord): FavouriteItem {
  return {
    id: record.id,
    name: record.name,
    country: record.country,
    ...(record.state !== null && { state: record.state }),
    lat: record.lat,
    lon: record.lon,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
  };
}

export class FavouritesService {
  constructor(private readonly repo: FavouritesRepo) {}

  /** Ordering: `sortOrder ASC NULLS LAST`, then `createdAt ASC` (see the repo). */
  async listForUser(userId: string): Promise<FavouriteItem[]> {
    const records = await this.repo.listForUser(userId);
    return records.map(toFavouriteItem);
  }

  /**
   * Save a favourite. Rejects with 400 FAVOURITES_LIMIT_REACHED at the cap
   * and 409 ALREADY_FAVOURITE when the user already has this lat/lon.
   */
  async add(userId: string, favourite: NewFavourite): Promise<FavouriteItem> {
    const count = await this.repo.countForUser(userId);
    if (count >= FAVOURITES_MAX_ENTRIES) {
      throw new AppError(
        400,
        ErrorCodes.FAVOURITES_LIMIT_REACHED,
        `You can save at most ${FAVOURITES_MAX_ENTRIES} favourites — remove one first.`,
      );
    }
    const created = await this.repo.create(userId, favourite);
    if (!created) {
      throw new AppError(
        409,
        ErrorCodes.ALREADY_FAVOURITE,
        "This location is already in your favourites.",
      );
    }
    return toFavouriteItem(created);
  }

  /** Returns false when the favourite is missing or belongs to another user. */
  async deleteOwned(userId: string, id: string): Promise<boolean> {
    return this.repo.deleteOwned(userId, id);
  }
}
