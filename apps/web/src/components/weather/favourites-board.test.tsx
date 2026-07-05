import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FavouritesBoard, type OptimisticFavourite } from "./favourites-board";
import { londonWeatherFixture } from "./weather.fixtures";

function favourite(id: string, name: string): OptimisticFavourite {
  return {
    id,
    name,
    country: "GB",
    lat: Number(id.slice(1)),
    lon: Number(id.slice(1)),
    sortOrder: null,
    createdAt: new Date().toISOString(),
    current: londonWeatherFixture.current,
  };
}

const THREE = [favourite("f1", "London"), favourite("f2", "Paris"), favourite("f3", "Berlin")];

function renderBoard(favourites: OptimisticFavourite[], overrides: { isSignedIn?: boolean } = {}) {
  const onRemove = vi.fn();
  const onReorder = vi.fn();
  render(
    <FavouritesBoard
      favourites={favourites}
      isSignedIn={overrides.isSignedIn ?? true}
      onRemove={onRemove}
      onReorder={onReorder}
    />,
  );
  return { onRemove, onReorder };
}

function cardNames(): string[] {
  return screen
    .getAllByTestId("weather-card")
    .map((card) => card.querySelector("[data-slot=card-title]")?.textContent ?? "");
}

/** The board's hover targets are the wrapper divs around each card. */
function cardWrapper(name: string): HTMLElement {
  const card = screen
    .getAllByTestId("weather-card")
    .find((candidate) => candidate.textContent?.includes(name));
  if (!card?.parentElement) throw new Error(`no card wrapper for ${name}`);
  return card.parentElement;
}

describe("FavouritesBoard", () => {
  it("renders the favourites as cards in order", () => {
    renderBoard(THREE);

    expect(cardNames().map((name) => name.trim())).toEqual([
      expect.stringContaining("London"),
      expect.stringContaining("Paris"),
      expect.stringContaining("Berlin"),
    ]);
  });

  it("drag: mousedown on the handle, hover another card, mouseup commits the new order", () => {
    const { onReorder } = renderBoard(THREE);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Reorder London" }));
    // Hover Berlin: London is spliced into Berlin's position (insertion, not swap).
    fireEvent.mouseOver(cardWrapper("Berlin"));
    fireEvent.mouseUp(window);

    expect(onReorder).toHaveBeenCalledExactlyOnceWith(["f2", "f3", "f1"]);
  });

  it("reorders live while hovering, before the drop", () => {
    renderBoard(THREE);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Reorder Berlin" }));
    fireEvent.mouseOver(cardWrapper("London"));

    expect(cardNames()[0]).toContain("Berlin");
  });

  it("marks the dragged card while dragging", () => {
    renderBoard(THREE);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Reorder London" }));

    expect(cardWrapper("London")).toHaveClass("opacity-50");
  });

  it("does not call onReorder when the drag ends where it started", () => {
    const { onReorder } = renderBoard(THREE);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Reorder London" }));
    fireEvent.mouseUp(window);

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("hides the drag handle when there is only one favourite", () => {
    renderBoard([favourite("f1", "London")]);

    expect(screen.queryByRole("button", { name: /Reorder/ })).not.toBeInTheDocument();
  });

  it("clicking the trash button calls onRemove with the id", async () => {
    const { onRemove } = renderBoard(THREE);

    await userEvent.click(screen.getByRole("button", { name: "Remove Paris from favourites" }));

    expect(onRemove).toHaveBeenCalledExactlyOnceWith("f2");
  });

  it("renders a degraded card (still removable) when the weather is unavailable", () => {
    renderBoard([{ ...favourite("f1", "London"), current: null }, favourite("f2", "Paris")]);

    const degraded = screen.getByTestId("favourite-card-unavailable");
    expect(degraded).toHaveTextContent("Weather unavailable");
    expect(
      screen.getByRole("button", { name: "Remove London from favourites" }),
    ).toBeInTheDocument();
  });

  it("signed in: shows the search hint in the empty state", () => {
    renderBoard([]);

    expect(screen.getByTestId("favourites-empty")).toHaveTextContent(
      "Search for a city and add it to your favourites.",
    );
  });

  it("signed out: the empty state suggests signing in", () => {
    renderBoard([], { isSignedIn: false });

    expect(screen.getByTestId("favourites-empty")).toHaveTextContent(
      "Search for a city, then sign in to save it here.",
    );
  });
});
