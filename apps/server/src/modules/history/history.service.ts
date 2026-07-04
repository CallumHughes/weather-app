import type { HistoryRecord, HistoryRepo, NewSearch } from "@/modules/history/history.repo";
import type { HistoryItem } from "@/modules/history/history.schemas";

/** GET /api/v1/history returns at most this many entries. */
export const HISTORY_LIST_LIMIT = 10;

/** Per-user storage cap; the oldest rows beyond it are evicted on insert. */
export const HISTORY_MAX_ENTRIES = 50;

function toHistoryItem(record: HistoryRecord): HistoryItem {
  return {
    id: record.id,
    query: record.query,
    resolvedName: record.resolvedName,
    country: record.country,
    ...(record.state !== null && { state: record.state }),
    lat: record.lat,
    lon: record.lon,
    createdAt: record.createdAt.toISOString(),
  };
}

export class HistoryService {
  constructor(private readonly repo: HistoryRepo) {}

  async listForUser(userId: string): Promise<HistoryItem[]> {
    const records = await this.repo.listForUser(userId, HISTORY_LIST_LIMIT);
    return records.map(toHistoryItem);
  }

  /** Returns false when the entry is missing or belongs to another user. */
  async deleteOwned(userId: string, id: string): Promise<boolean> {
    return this.repo.deleteOwned(userId, id);
  }

  /**
   * Record a successful search for a signed-in user.
   *
   * - Consecutive dedupe: a repeat of the most recent location refreshes
   *   that entry (timestamp + raw query) instead of inserting a new row.
   * - Cap: after an insert, rows beyond the newest HISTORY_MAX_ENTRIES are
   *   evicted.
   */
  async record(userId: string, search: NewSearch): Promise<void> {
    const latest = await this.repo.findLatestForUser(userId);
    if (latest && latest.lat === search.lat && latest.lon === search.lon) {
      await this.repo.touch(latest.id, search.query);
      return;
    }
    await this.repo.insert(userId, search);
    await this.repo.deleteBeyondNewest(userId, HISTORY_MAX_ENTRIES);
  }
}
