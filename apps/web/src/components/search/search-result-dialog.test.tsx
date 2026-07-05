import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addFavouriteAction } from "@/app/actions/favourites";
import { useSearch } from "@/hooks/use-search";
import { ApiError, type FavouriteWithWeather, getWeather } from "@/lib/api";
import { FavouritesProvider } from "@/providers/favourites-provider";
import { SearchProvider } from "@/providers/search-provider";
import { londonWeatherFixture } from "../weather.fixtures";
import { SearchResultDialog } from "./search-result-dialog";

// Mock the api module (not React Query) — ApiError stays real.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getWeather: vi.fn() };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: vi.fn(() => ({ data: null, isPending: false })) },
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
const addFavouriteActionMock = vi.mocked(addFavouriteAction);

const londonFavourite: FavouriteWithWeather = {
  id: "f-london",
  name: "London",
  country: "GB",
  state: "England",
  lat: londonWeatherFixture.location.lat,
  lon: londonWeatherFixture.location.lon,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  current: londonWeatherFixture.current,
};

/** Submits the search once on mount — the dialog opens the way it does live. */
function AutoSubmit({ term }: { term: string }) {
  const { submitSearch } = useSearch();
  const submitted = useRef(false);
  useEffect(() => {
    if (!submitted.current) {
      submitted.current = true;
      submitSearch(term);
    }
  }, [term, submitSearch]);
  return null;
}

function renderDialog({
  search = "London",
  isSignedIn = true,
  favourites = [] as FavouriteWithWeather[],
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FavouritesProvider favourites={favourites}>
        <SearchProvider>
          <SearchResultDialog isSignedIn={isSignedIn} />
          <AutoSubmit term={search} />
        </SearchProvider>
      </FavouritesProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getWeatherMock.mockReset();
  addFavouriteActionMock.mockReset();
});

describe("SearchResultDialog", () => {
  it("shows the loading skeleton while fetching and disables Add", async () => {
    getWeatherMock.mockImplementation(() => new Promise(() => {}));
    renderDialog();

    expect(await screen.findByTestId("weather-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("renders the weather card on success with Add enabled", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderDialog();

    expect(await screen.findByTestId("weather-card")).toBeInTheDocument();
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("clicking Add persists the fetched location and closes the dialog", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    addFavouriteActionMock.mockResolvedValue({ ok: true });
    renderDialog();

    await screen.findByTestId("weather-card");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(screen.queryByTestId("search-result-dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(addFavouriteActionMock).toHaveBeenCalledExactlyOnceWith(londonWeatherFixture.location),
    );
  });

  it("shows a disabled Saved button when the location is already a favourite", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderDialog({ favourites: [londonFavourite] });

    await screen.findByTestId("weather-card");
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("signed out: shows Sign in to save instead of Add", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderDialog({ isSignedIn: false });

    await screen.findByTestId("weather-card");
    expect(screen.getByRole("button", { name: "Sign in to save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("Cancel closes the dialog", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderDialog();

    await screen.findByTestId("weather-card");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByTestId("search-result-dialog")).not.toBeInTheDocument(),
    );
  });

  it("renders the not-found state echoing the query on a 404", async () => {
    getWeatherMock.mockRejectedValue(
      new ApiError(404, "LOCATION_NOT_FOUND", 'No location found matching "Atlantis".'),
    );
    renderDialog({ search: "Atlantis" });

    const notFound = await screen.findByTestId("weather-not-found");
    expect(notFound).toHaveTextContent("Couldn’t find “Atlantis”");
    expect(screen.queryByTestId("weather-error")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("renders the error state with a Retry button that refetches", async () => {
    getWeatherMock.mockRejectedValue(new ApiError(502, "UPSTREAM_ERROR", "Upstream unavailable."));
    renderDialog();

    expect(await screen.findByTestId("weather-error")).toBeInTheDocument();
    expect(getWeatherMock).toHaveBeenCalledTimes(1);

    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByTestId("weather-card")).toBeInTheDocument();
    await waitFor(() => expect(getWeatherMock).toHaveBeenCalledTimes(2));
  });
});
