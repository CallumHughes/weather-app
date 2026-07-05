import type { HistoryRecord, HistoryRepo, NewSearch } from "@/modules/history/history.repo";
import type { HistoryItem } from "@/modules/history/history.schemas";

/** GET /api/v1/history returns at most this many entries. */
export const HISTORY_LIST_LIMIT = 5;

/**
 * Read-side bound: how many newest rows the display-list dedupe scans.
 * Storage itself is uncapped (every search is kept as an audit trail), so
 * this keeps the list read O(1) regardless of how much history accrues.
 */
export const HISTORY_DEDUPE_SCAN_LIMIT = 50;

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

  /**
   * The user's recent searches for display: newest first, one entry per
   * location, at most HISTORY_LIST_LIMIT.
   *
   * Decision — dedupe at read time, not write time: every search stays in
   * storage as an audit trail (write-time dedupe only collapses immediate
   * repeats, see record()), but the displayed list collapses repeat searches
   * of the same coordinates to their most recent occurrence. Deleting a
   * visible entry may therefore surface an older search of the same place —
   * expected, since only that one row was deleted.
   */
  async listForUser(userId: string): Promise<HistoryItem[]> {
    // Bounded scan so dedupe can't starve the list below the display limit
    // while distinct locations remain, without reading unbounded storage.
    const records = await this.repo.listForUser(userId, HISTORY_DEDUPE_SCAN_LIMIT);
    const seen = new Set<string>();
    const distinct: HistoryRecord[] = [];
    for (const record of records) {
      const location = `${record.lat}:${record.lon}`;
      if (seen.has(location)) {
        continue;
      }
      seen.add(location);
      distinct.push(record);
      if (distinct.length === HISTORY_LIST_LIMIT) {
        break;
      }
    }
    return distinct.map(toHistoryItem);
  }

  /** Returns false when the entry is missing or belongs to another user. */
  async deleteOwned(userId: string, id: string): Promise<boolean> {
    return this.repo.deleteOwned(userId, id);
  }

  /**
   * Record a successful search for a signed-in user. Consecutive dedupe: a
   * repeat of the most recent location refreshes that entry (timestamp + raw
   * query) instead of inserting a new row. Storage is uncapped.
   */
  async record(userId: string, search: NewSearch): Promise<void> {
    const latest = await this.repo.findLatestForUser(userId);
    if (latest && latest.lat === search.lat && latest.lon === search.lon) {
      await this.repo.touch(latest.id, search.query);
      return;
    }
    await this.repo.insert(userId, search);
  }
}
