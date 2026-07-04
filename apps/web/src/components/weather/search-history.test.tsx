import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteHistoryItem, getHistory, type HistoryItem } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { SearchHistory } from "./search-history";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getHistory: vi.fn(), deleteHistoryItem: vi.fn() };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: vi.fn() },
}));

const getHistoryMock = vi.mocked(getHistory);
const deleteHistoryItemMock = vi.mocked(deleteHistoryItem);
const useSessionMock = vi.mocked(authClient.useSession);

function historyItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "h1",
    query: "london",
    resolvedName: "London",
    country: "GB",
    state: "England",
    lat: 51.5073219,
    lon: -0.1276474,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function signedIn() {
  useSessionMock.mockReturnValue({
    data: { user: { id: "user-1" } },
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

function signedOut() {
  useSessionMock.mockReturnValue({
    data: null,
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

function renderPanel(onSelect: (location: string) => void = () => {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchHistory onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getHistoryMock.mockReset();
  deleteHistoryItemMock.mockReset();
  useSessionMock.mockReset();
});

describe("SearchHistory", () => {
  it("signed out: renders the sign-in hint and never fetches history", async () => {
    signedOut();
    renderPanel();

    const hint = screen.getByTestId("history-signed-out");
    expect(hint).toHaveTextContent("Sign in to keep your search history");
    expect(screen.queryByTestId("search-history")).not.toBeInTheDocument();
    expect(getHistoryMock).not.toHaveBeenCalled();
  });

  it("signed out: the hint opens the auth drawer instead of linking to a login page", async () => {
    signedOut();
    renderPanel();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in to keep your search history" }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sign in to keep favourites and search history.")).toBeInTheDocument();
  });

  it("signed in: shows skeletons while loading, then the list", async () => {
    signedIn();
    let resolve: (items: HistoryItem[]) => void = () => {};
    getHistoryMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    renderPanel();

    expect(screen.getByText("Recent searches")).toBeInTheDocument();
    expect(screen.getByTestId("history-loading")).toBeInTheDocument();

    resolve([
      historyItem(),
      historyItem({ id: "h2", resolvedName: "Paris", country: "FR", state: undefined }),
    ]);

    expect(await screen.findByTestId("history-list")).toBeInTheDocument();
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();
    expect(screen.getByText("Paris, FR")).toBeInTheDocument();
  });

  it("signed in: shows the empty state when there is no history", async () => {
    signedIn();
    getHistoryMock.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByTestId("history-empty")).toBeInTheDocument();
    expect(screen.getByText("Your searches will appear here.")).toBeInTheDocument();
  });

  it("signed in: shows the error state with a Retry button that refetches", async () => {
    signedIn();
    getHistoryMock.mockRejectedValue(new Error("boom"));
    renderPanel();

    expect(await screen.findByTestId("history-error")).toBeInTheDocument();

    getHistoryMock.mockResolvedValue([historyItem()]);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByTestId("history-list")).toBeInTheDocument();
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();
  });

  it("deletes an item and refetches the list", async () => {
    signedIn();
    const london = historyItem();
    const paris = historyItem({ id: "h2", resolvedName: "Paris", country: "FR" });
    getHistoryMock.mockResolvedValueOnce([london, paris]).mockResolvedValueOnce([paris]);
    deleteHistoryItemMock.mockResolvedValue(undefined);
    renderPanel();

    await screen.findByTestId("history-list");
    await userEvent.click(screen.getByRole("button", { name: "Delete London from history" }));

    // TanStack Query passes a context object as the second mutationFn arg.
    expect(deleteHistoryItemMock).toHaveBeenCalledWith("h1", expect.anything());
    // The delete's onSuccess invalidates ["history"] → the list refetches.
    await waitFor(() => expect(getHistoryMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("London, England, GB")).not.toBeInTheDocument());
    expect(screen.getByText(/Paris/)).toBeInTheDocument();
  });

  it("clicking a row re-runs that search via onSelect", async () => {
    signedIn();
    getHistoryMock.mockResolvedValue([historyItem()]);
    const onSelect = vi.fn();
    renderPanel(onSelect);

    await screen.findByTestId("history-list");
    await userEvent.click(screen.getByRole("button", { name: /London, England, GB/ }));

    expect(onSelect).toHaveBeenCalledWith("London");
  });
});
