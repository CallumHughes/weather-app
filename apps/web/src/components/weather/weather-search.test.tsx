import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  addFavourite,
  deleteFavourite,
  type FavouriteItem,
  getFavourites,
  getWeather,
} from "@/lib/api";
import { londonWeatherFixture } from "./weather.fixtures";
import { WeatherSearch } from "./weather-search";

// Mock the api module (not React Query) — ApiError stays real.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getWeather: vi.fn(),
    getFavourites: vi.fn(),
    addFavourite: vi.fn(),
    deleteFavourite: vi.fn(),
  };
});

const getWeatherMock = vi.mocked(getWeather);
const getFavouritesMock = vi.mocked(getFavourites);
const addFavouriteMock = vi.mocked(addFavourite);
const deleteFavouriteMock = vi.mocked(deleteFavourite);

const londonFavourite: FavouriteItem = {
  id: "f1",
  name: "London",
  country: "GB",
  state: "England",
  lat: londonWeatherFixture.location.lat,
  lon: londonWeatherFixture.location.lon,
  sortOrder: null,
  createdAt: new Date().toISOString(),
};

/** The search state is lifted (see WeatherHome); a stateful harness stands in. */
function Harness({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const [search, setSearch] = useState("");
  return <WeatherSearch search={search} onSearchChange={setSearch} isSignedIn={isSignedIn} />;
}

function renderSearch({ isSignedIn = false }: { isSignedIn?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness isSignedIn={isSignedIn} />
    </QueryClientProvider>,
  );
}

async function searchFor(location: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("City"), location);
  await user.click(screen.getByRole("button", { name: /search/i }));
  return user;
}

beforeEach(() => {
  getWeatherMock.mockReset();
  getFavouritesMock.mockReset();
  addFavouriteMock.mockReset();
  deleteFavouriteMock.mockReset();
});

describe("WeatherSearch", () => {
  it("shows the empty state before anything is searched", () => {
    renderSearch();

    expect(screen.getByTestId("weather-empty")).toBeInTheDocument();
    expect(screen.getByText("Search for a city")).toBeInTheDocument();
  });

  it("shows the loading skeleton and disables the button while fetching", async () => {
    getWeatherMock.mockImplementation(() => new Promise(() => {}));
    renderSearch();

    await searchFor("London");

    expect(await screen.findByTestId("weather-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeDisabled();
  });

  it("renders the weather card on success", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderSearch();

    await searchFor("London");

    expect(await screen.findByTestId("weather-card")).toBeInTheDocument();
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();
    expect(getWeatherMock).toHaveBeenCalledWith("London");
  });

  it("renders the not-found state echoing the query on a 404", async () => {
    getWeatherMock.mockRejectedValue(
      new ApiError(404, "LOCATION_NOT_FOUND", 'No location found matching "Atlantis".'),
    );
    renderSearch();

    await searchFor("Atlantis");

    const notFound = await screen.findByTestId("weather-not-found");
    expect(notFound).toHaveTextContent("Atlantis");
    expect(screen.queryByTestId("weather-error")).not.toBeInTheDocument();
  });

  it("renders the error state with a Retry button that refetches", async () => {
    getWeatherMock.mockRejectedValue(new ApiError(502, "UPSTREAM_ERROR", "Upstream unavailable."));
    renderSearch();

    const user = await searchFor("London");

    expect(await screen.findByTestId("weather-error")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong fetching the weather.")).toBeInTheDocument();
    expect(getWeatherMock).toHaveBeenCalledTimes(1);

    // Retry: the next attempt succeeds and renders the card.
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByTestId("weather-card")).toBeInTheDocument();
    await waitFor(() => expect(getWeatherMock).toHaveBeenCalledTimes(2));
  });

  it("marks the results region as a polite live region", () => {
    renderSearch();

    const empty = screen.getByTestId("weather-empty");
    expect(empty.parentElement).toHaveAttribute("aria-live", "polite");
  });

  describe("favourite star toggle", () => {
    it("signed out: no star on the result and no favourites fetch", async () => {
      getWeatherMock.mockResolvedValue(londonWeatherFixture);
      renderSearch();

      await searchFor("London");
      await screen.findByTestId("weather-card");

      expect(screen.queryByRole("button", { name: /favourites/i })).not.toBeInTheDocument();
      expect(getFavouritesMock).not.toHaveBeenCalled();
    });

    it("signed in, not yet favourited: star is unpressed and adds the resolved location", async () => {
      getWeatherMock.mockResolvedValue(londonWeatherFixture);
      getFavouritesMock.mockResolvedValueOnce([]).mockResolvedValueOnce([londonFavourite]);
      addFavouriteMock.mockResolvedValue(londonFavourite);
      renderSearch({ isSignedIn: true });

      const user = await searchFor("London");
      await screen.findByTestId("weather-card");

      const star = await screen.findByRole("button", { name: "Add London to favourites" });
      expect(star).toHaveAttribute("aria-pressed", "false");

      await user.click(star);

      expect(addFavouriteMock).toHaveBeenCalledWith(londonWeatherFixture.location);
      // One invalidation per mutation: the list refetches once and the star
      // flips to the pressed/remove state.
      await waitFor(() => expect(getFavouritesMock).toHaveBeenCalledTimes(2));
      const pressed = await screen.findByRole("button", {
        name: "Remove London from favourites",
      });
      expect(pressed).toHaveAttribute("aria-pressed", "true");
    });

    it("signed in, already favourited: star is pressed and removes the favourite", async () => {
      getWeatherMock.mockResolvedValue(londonWeatherFixture);
      getFavouritesMock.mockResolvedValueOnce([londonFavourite]).mockResolvedValueOnce([]);
      deleteFavouriteMock.mockResolvedValue(undefined);
      renderSearch({ isSignedIn: true });

      const user = await searchFor("London");
      await screen.findByTestId("weather-card");

      const star = await screen.findByRole("button", { name: "Remove London from favourites" });
      expect(star).toHaveAttribute("aria-pressed", "true");

      await user.click(star);

      expect(deleteFavouriteMock).toHaveBeenCalledWith("f1", expect.anything());
      await waitFor(() => expect(getFavouritesMock).toHaveBeenCalledTimes(2));
      const unpressed = await screen.findByRole("button", { name: "Add London to favourites" });
      expect(unpressed).toHaveAttribute("aria-pressed", "false");
    });

    it("treats a 409 ALREADY_FAVOURITE on add as success and refetches the list", async () => {
      getWeatherMock.mockResolvedValue(londonWeatherFixture);
      getFavouritesMock.mockResolvedValueOnce([]).mockResolvedValueOnce([londonFavourite]);
      addFavouriteMock.mockRejectedValue(
        new ApiError(409, "ALREADY_FAVOURITE", "This location is already in your favourites."),
      );
      renderSearch({ isSignedIn: true });

      const user = await searchFor("London");
      await screen.findByTestId("weather-card");

      await user.click(await screen.findByRole("button", { name: "Add London to favourites" }));

      // Stale-state 409 → invalidate and move on: the refetched list shows
      // the favourite, so the star ends up pressed with no error surfaced.
      await waitFor(() => expect(getFavouritesMock).toHaveBeenCalledTimes(2));
      expect(
        await screen.findByRole("button", { name: "Remove London from favourites" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
});
