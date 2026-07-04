import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHistory, getWeather, type HistoryItem } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { londonWeatherFixture } from "./weather.fixtures";
import { WeatherHome } from "./weather-home";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getWeather: vi.fn(), getHistory: vi.fn(), deleteHistoryItem: vi.fn() };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: vi.fn() },
}));

const getWeatherMock = vi.mocked(getWeather);
const getHistoryMock = vi.mocked(getHistory);
const useSessionMock = vi.mocked(authClient.useSession);

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

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WeatherHome />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getWeatherMock.mockReset();
  getHistoryMock.mockReset();
  useSessionMock.mockReset();
});

describe("WeatherHome", () => {
  it("clicking a history row triggers a weather search for that location", async () => {
    setSession(true);
    getHistoryMock.mockResolvedValue([londonHistoryItem]);
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderHome();

    await screen.findByTestId("history-list");
    await userEvent.click(screen.getByRole("button", { name: /London, England, GB/ }));

    expect(await screen.findByTestId("weather-card")).toBeInTheDocument();
    expect(getWeatherMock).toHaveBeenCalledWith("London");
    // The re-run also fills the search input with the resolved name.
    expect(screen.getByLabelText("City")).toHaveValue("London");
  });

  it("invalidates the history query after a successful signed-in search", async () => {
    setSession(true);
    getHistoryMock.mockResolvedValue([]);
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderHome();

    await screen.findByTestId("history-empty");
    expect(getHistoryMock).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    await screen.findByTestId("weather-card");

    // Weather success while signed in → ["history"] invalidated → refetch.
    await waitFor(() => expect(getHistoryMock).toHaveBeenCalledTimes(2));
  });

  it("signed out: renders the sign-in hint and searches do not touch history", async () => {
    setSession(false);
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderHome();

    expect(screen.getByTestId("history-signed-out")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    await screen.findByTestId("weather-card");

    expect(getHistoryMock).not.toHaveBeenCalled();
  });
});
