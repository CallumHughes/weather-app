import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteFavourite, type FavouriteItem, getFavourites } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import { Favourites } from "./favourites";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getFavourites: vi.fn(), deleteFavourite: vi.fn() };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: vi.fn() },
}));

const getFavouritesMock = vi.mocked(getFavourites);
const deleteFavouriteMock = vi.mocked(deleteFavourite);
const useSessionMock = vi.mocked(authClient.useSession);

function favouriteItem(overrides: Partial<FavouriteItem> = {}): FavouriteItem {
  return {
    id: "f1",
    name: "London",
    country: "GB",
    state: "England",
    lat: 51.5073219,
    lon: -0.1276474,
    sortOrder: null,
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
      <Favourites onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getFavouritesMock.mockReset();
  deleteFavouriteMock.mockReset();
  useSessionMock.mockReset();
});

describe("Favourites", () => {
  it("signed out: renders nothing and never fetches favourites", () => {
    signedOut();
    const { container } = renderPanel();

    expect(container).toBeEmptyDOMElement();
    expect(getFavouritesMock).not.toHaveBeenCalled();
  });

  it("signed in: shows skeletons while loading, then the list", async () => {
    signedIn();
    let resolve: (items: FavouriteItem[]) => void = () => {};
    getFavouritesMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    renderPanel();

    expect(screen.getByText("Favourites")).toBeInTheDocument();
    expect(screen.getByTestId("favourites-loading")).toBeInTheDocument();

    resolve([
      favouriteItem(),
      favouriteItem({ id: "f2", name: "Paris", country: "FR", state: undefined }),
    ]);

    expect(await screen.findByTestId("favourites-list")).toBeInTheDocument();
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();
    expect(screen.getByText("Paris, FR")).toBeInTheDocument();
  });

  it("signed in: shows the empty state when there are no favourites", async () => {
    signedIn();
    getFavouritesMock.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByTestId("favourites-empty")).toBeInTheDocument();
    expect(screen.getByText("Star a location to save it here.")).toBeInTheDocument();
  });

  it("signed in: shows the error state with a Retry button that refetches", async () => {
    signedIn();
    getFavouritesMock.mockRejectedValue(new Error("boom"));
    renderPanel();

    expect(await screen.findByTestId("favourites-error")).toBeInTheDocument();

    getFavouritesMock.mockResolvedValue([favouriteItem()]);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByTestId("favourites-list")).toBeInTheDocument();
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();
  });

  it("removes a favourite and refetches the list", async () => {
    signedIn();
    const london = favouriteItem();
    const paris = favouriteItem({ id: "f2", name: "Paris", country: "FR" });
    getFavouritesMock.mockResolvedValueOnce([london, paris]).mockResolvedValueOnce([paris]);
    deleteFavouriteMock.mockResolvedValue(undefined);
    renderPanel();

    await screen.findByTestId("favourites-list");
    await userEvent.click(screen.getByRole("button", { name: "Remove London from favourites" }));

    // TanStack Query passes a context object as the second mutationFn arg.
    expect(deleteFavouriteMock).toHaveBeenCalledWith("f1", expect.anything());
    // The remove's onSuccess invalidates ["favourites"] → the list refetches.
    await waitFor(() => expect(getFavouritesMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("London, England, GB")).not.toBeInTheDocument());
    expect(screen.getByText(/Paris/)).toBeInTheDocument();
  });

  it("clicking a row re-runs that search via onSelect", async () => {
    signedIn();
    getFavouritesMock.mockResolvedValue([favouriteItem()]);
    const onSelect = vi.fn();
    renderPanel(onSelect);

    await screen.findByTestId("favourites-list");
    await userEvent.click(screen.getByRole("button", { name: /London, England, GB/ }));

    expect(onSelect).toHaveBeenCalledWith("London");
  });
});
