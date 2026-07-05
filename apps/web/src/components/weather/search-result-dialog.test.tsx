import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getWeather } from "@/lib/api";

import { SearchResultDialog, type SearchResultDialogProps } from "./search-result-dialog";
import { londonWeatherFixture } from "./weather.fixtures";

// Mock the api module (not React Query) — ApiError stays real.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getWeather: vi.fn() };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: vi.fn(() => ({ data: null, isPending: false })) },
}));

const getWeatherMock = vi.mocked(getWeather);

function renderDialog(overrides: Partial<SearchResultDialogProps> = {}) {
  const props: SearchResultDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    search: "London",
    isSignedIn: true,
    isSaved: () => false,
    onAdd: vi.fn(),
    ...overrides,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SearchResultDialog {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  getWeatherMock.mockReset();
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

  it("clicking Add passes the fetched weather to onAdd", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    const props = renderDialog();

    await screen.findByTestId("weather-card");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(props.onAdd).toHaveBeenCalledExactlyOnceWith(londonWeatherFixture);
  });

  it("shows a disabled Saved button when the location is already a favourite", async () => {
    getWeatherMock.mockResolvedValue(londonWeatherFixture);
    renderDialog({
      isSaved: (lat, lon) =>
        lat === londonWeatherFixture.location.lat && lon === londonWeatherFixture.location.lon,
    });

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
    const props = renderDialog();

    await screen.findByTestId("weather-card");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
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
