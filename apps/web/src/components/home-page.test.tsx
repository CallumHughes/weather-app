import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addFavouriteAction, removeFavouriteAction } from "@/app/actions/favourites";

import { type FavouriteWithWeather, getHistory, getWeather, type HistoryItem } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { FavouritesProvider } from "@/providers/favourites-provider";
import { SearchProvider } from "@/providers/search-provider";
import { FavouritesBoard } from "./favourites/favourites-board";
import { SearchHistory } from "./history/search-history";
import { SearchBar } from "./search/search-bar";
import { SearchResultDialog } from "./search/search-result-dialog";
import { londonWeatherFixture } from "./weather.fixtures";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getWeather: vi.fn(),
    getHistory: vi.fn(),
    deleteHistoryItem: vi.fn(),
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: vi.fn() },
}));

vi.mock("@/app/actions/favourites", () => ({
  addFavouriteAction: vi.fn(),
  removeFavouriteAction: vi.fn(),
  reorderFavouritesAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const getWeatherMock = vi.mocked(getWeather);
const getHistoryMock = vi.mocked(getHistory);
const addFavouriteActionMock = vi.mocked(addFavouriteAction);
const removeFavouriteActionMock = vi.mocked(removeFavouriteAction);
const useSessionMock = vi.mocked(authClient.useSession);

const parisFavourite: FavouriteWithWeather = {
  id: "f-paris",
  name: "Paris",
  country: "FR",
  lat: 48.85,
  lon: 2.35,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  current: londonWeatherFixture.current,
};

const londonHistoryItem: HistoryItem = {
  id: "h1",
  query: "london",
  resolvedName: "London",
  country: "GB",
  state: "England",
  lat: 51.5073219,
  lon: -0.1276474,
  createdAt: new Date().toISOString(),
};

function setSession(signedIn: boolean) {
  useSessionMock.mockReturnValue({
    data: signedIn ? { user: { id: "user-1" } } : null,
    isPending: false,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

/** Mirrors the client tree app/page.tsx + FavouritesSection compose (both are
 *  async server components, so they can't render in jsdom): the search state
 *  wraps everything, the favourites provider only the board and the dialog. */
function HomeShell({
  isSignedIn,
  favourites,
}: {
  isSignedIn: boolean;
  favourites: FavouriteWithWeather[];
}) {
  return (
    <SearchProvider>
      <SearchBar />
      <FavouritesProvider favourites={favourites}>
        <FavouritesBoard isSignedIn={isSignedIn} />
        <SearchResultDialog isSignedIn={isSignedIn} />
      </FavouritesProvider>
      <SearchHistory isSignedIn={isSignedIn} />
    </SearchProvider>
  );
}

function renderHome({ isSignedIn = true, favourites = [] as FavouriteWithWeather[] } = {}) {
  setSession(isSignedIn);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeShell isSignedIn={isSignedIn} favourites={favourites} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getWeatherMock.mockReset();
  getHistoryMock.mockReset();
  addFavouriteActionMock.mockReset();
  removeFavouriteActionMock.mockReset();
  useSessionMock.mockReset();
  getHistoryMock.mockResolvedValue([]);
});

describe("home page composition", () => {
  it("submitting a search opens the result dialog with the weather card", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderHome();

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const dialog = await screen.findByTestId("search-result-dialog");
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByTestId("weather-card")).toBeInTheDocument();
    expect(getWeatherMock).toHaveBeenCalledWith("London");
  });

  it("Add optimistically prepends the favourite and closes the dialog", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    // Deferred: the optimistic state stays visible for assertions, but the
    // promise MUST resolve before the test ends — React 19 entangles async
    // transitions, so an unresolved action blocks later tests' transitions.
    let resolveAdd = (_: { ok: true }) => {};
    addFavouriteActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
    renderHome({ favourites: [parisFavourite] });

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const dialog = await screen.findByTestId("search-result-dialog");
    await within(dialog).findByTestId("weather-card");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(screen.queryByTestId("search-result-dialog")).not.toBeInTheDocument(),
    );
    const board = screen.getByTestId("favourites-board");
    const cards = screen.getAllByTestId("weather-card");
    expect(board).toContainElement(cards[0] ?? null);
    expect(cards[0]).toHaveTextContent("London, England, GB");
    expect(cards[1]).toHaveTextContent("Paris");
    expect(addFavouriteActionMock).toHaveBeenCalledExactlyOnceWith(londonWeatherFixture.location);

    resolveAdd({ ok: true });
  });

  it("reverts the optimistic add when the action fails", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    addFavouriteActionMock.mockResolvedValue({
      ok: false,
      code: "FAVOURITES_LIMIT_REACHED",
      message: "You can save at most 20 favourites — remove one first.",
    });
    renderHome({ favourites: [parisFavourite] });

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const dialog = await screen.findByTestId("search-result-dialog");
    await within(dialog).findByTestId("weather-card");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    // The action settled with an error: the message is surfaced and the
    // optimistic card reverts away.
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    await waitFor(() => {
      const cards = screen.getAllByTestId("weather-card");
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveTextContent("Paris");
    });
  });

  it("removing a favourite hides its card immediately", async () => {
    // Deferred (see the add test): resolved before the test ends.
    let resolveRemove = (_: { ok: true }) => {};
    removeFavouriteActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemove = resolve;
        }),
    );
    renderHome({ favourites: [parisFavourite] });

    await userEvent.click(screen.getByRole("button", { name: "Remove Paris from favourites" }));

    await waitFor(() => expect(screen.queryAllByTestId("weather-card")).toHaveLength(0));
    expect(screen.getByTestId("favourites-empty")).toBeInTheDocument();
    expect(removeFavouriteActionMock).toHaveBeenCalledExactlyOnceWith("f-paris");

    resolveRemove({ ok: true });
  });

  it("signed out: the dialog offers Sign in to save instead of Add", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderHome({ isSignedIn: false });

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByTestId("weather-card");
    expect(screen.getByRole("button", { name: "Sign in to save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("clicking a history row re-runs the search in the dialog", async () => {
    getHistoryMock.mockResolvedValue([londonHistoryItem]);
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderHome();

    await screen.findByTestId("history-list");
    await userEvent.click(screen.getByRole("button", { name: /London, England, GB/ }));

    expect(await screen.findByTestId("search-result-dialog")).toBeInTheDocument();
    expect(getWeatherMock).toHaveBeenCalledWith("London");
    // The re-run also fills the search input with the resolved name.
    expect(screen.getByLabelText("City")).toHaveValue("London");
  });

  it("invalidates the history query after a successful signed-in search", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderHome();

    await screen.findByTestId("history-empty");
    expect(getHistoryMock).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByTestId("weather-card");

    // Weather success while signed in → ["history"] invalidated → refetch.
    await waitFor(() => expect(getHistoryMock).toHaveBeenCalledTimes(2));
  });
});
