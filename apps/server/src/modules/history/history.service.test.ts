import { describe, expect, it } from "vitest";

import type { NewSearch } from "@/modules/history/history.repo";
import {
  HISTORY_LIST_LIMIT,
  HISTORY_MAX_ENTRIES,
  HistoryService,
} from "@/modules/history/history.service";
import { InMemoryHistoryRepo } from "@/test/fakes";

const USER = "user-1";

function search(overrides: Partial<NewSearch> = {}): NewSearch {
  return {
    query: "London",
    resolvedName: "London",
    country: "GB",
    state: "England",
    lat: 51.51,
    lon: -0.13,
    ...overrides,
  };
}

function setup() {
  const repo = new InMemoryHistoryRepo();
  return { repo, service: new HistoryService(repo) };
}

describe("HistoryService.record", () => {
  it("inserts a row for a new search", async () => {
    const { repo, service } = setup();
    await service.record(USER, search());

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ userId: USER, query: "London", lat: 51.51, lon: -0.13 });
  });

  it("dedupes a consecutive repeat of the same coordinates (updates in place)", async () => {
    const { repo, service } = setup();
    await service.record(USER, search({ query: "London" }));
    const firstId = repo.rows[0]?.id;
    const firstCreatedAt = repo.rows[0]?.createdAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.record(USER, search({ query: "london " }));

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.id).toBe(firstId);
    expect(repo.rows[0]?.query).toBe("london ");
    expect(repo.rows[0]?.createdAt.getTime()).toBeGreaterThan(firstCreatedAt?.getTime() ?? 0);
  });

  it("does not dedupe non-consecutive repeats (A, B, A → three rows)", async () => {
    const { repo, service } = setup();
    await service.record(USER, search({ lat: 51.51, lon: -0.13 }));
    await service.record(USER, search({ resolvedName: "Paris", lat: 48.86, lon: 2.35 }));
    await service.record(USER, search({ lat: 51.51, lon: -0.13 }));

    expect(repo.rows).toHaveLength(3);
  });

  it("dedupe is per-user: another user's identical search is a new row", async () => {
    const { repo, service } = setup();
    await service.record(USER, search());
    await service.record("user-2", search());

    expect(repo.rows).toHaveLength(2);
  });

  it("caps storage: the 51st distinct search evicts the oldest", async () => {
    const { repo, service } = setup();
    for (let i = 0; i < HISTORY_MAX_ENTRIES; i++) {
      await service.record(USER, search({ resolvedName: `City ${i}`, lat: i, lon: i }));
    }
    expect(repo.rows).toHaveLength(HISTORY_MAX_ENTRIES);

    await service.record(USER, search({ resolvedName: "City 50", lat: 50.5, lon: 50.5 }));

    expect(repo.rows).toHaveLength(HISTORY_MAX_ENTRIES);
    const names = repo.rows.map((row) => row.resolvedName);
    expect(names).not.toContain("City 0"); // oldest evicted
    expect(names).toContain("City 50"); // newest kept
  });
});

describe("HistoryService.listForUser", () => {
  it("returns at most 10 items, newest first, mapped to the DTO", async () => {
    const { repo, service } = setup();
    for (let i = 0; i < 12; i++) {
      repo.seed(USER, search({ resolvedName: `City ${i}`, lat: i, lon: i }), new Date(1000 * i));
    }

    const items = await service.listForUser(USER);

    expect(items).toHaveLength(HISTORY_LIST_LIMIT);
    expect(items[0]?.resolvedName).toBe("City 11");
    expect(items[9]?.resolvedName).toBe("City 2");
    expect(items[0]?.createdAt).toBe(new Date(11_000).toISOString());
  });

  it("omits `state` when the stored row has none", async () => {
    const { repo, service } = setup();
    const { state: _state, ...withoutState } = search();
    repo.seed(USER, withoutState, new Date());

    const items = await service.listForUser(USER);
    expect(items[0]).not.toHaveProperty("state");
  });
});
