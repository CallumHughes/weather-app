import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getWeather } from "@/lib/api";
import { londonWeatherFixture } from "./weather.fixtures";
import { WeatherSearch } from "./weather-search";

// Mock the api module (not React Query) — ApiError stays real.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getWeather: vi.fn() };
});

const getWeatherMock = vi.mocked(getWeather);

/** The search state is lifted (see WeatherHome); a stateful harness stands in. */
function Harness() {
  const [search, setSearch] = useState("");
  return <WeatherSearch search={search} onSearchChange={setSearch} />;
}

function renderSearch() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
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
});
