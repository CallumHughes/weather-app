"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addFavouriteAction,
  removeFavouriteAction,
  reorderFavouritesAction,
} from "@/app/actions/favourites";
import type { FavouriteWithWeather, WeatherResult } from "@/lib/api";

import { FavouritesBoard, type OptimisticFavourite } from "./favourites-board";
import { SearchHistory } from "./search-history";
import { SearchResultDialog } from "./search-result-dialog";
import { WeatherSearch } from "./weather-search";

type FavouritesOptimisticAction =
  | { type: "add"; favourite: OptimisticFavourite }
  | { type: "remove"; id: string }
  | { type: "reorder"; ids: string[] };

function applyFavouritesAction(
  state: OptimisticFavourite[],
  action: FavouritesOptimisticAction,
): OptimisticFavourite[] {
  switch (action.type) {
    case "add":
      // New favourites go to the top — mirrors the server's create-at-top.
      return [action.favourite, ...state];
    case "remove":
      return state.filter((favourite) => favourite.id !== action.id);
    case "reorder": {
      const position = new Map(action.ids.map((id, index) => [id, index]));
      return [...state].sort(
        (a, b) =>
          (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }
  }
}

export interface WeatherHomeProps {
  isSignedIn: boolean;
  /** Server-fetched favourites (with weather) in display order. */
  favourites: FavouriteWithWeather[];
}

/**
 * Client shell of the home page: owns the submitted search (the form, the
 * result dialog and the history panel all drive it) and the optimistic
 * favourites list that the dialog adds to and the board removes/reorders.
 */
export function WeatherHome({ isSignedIn, favourites }: WeatherHomeProps) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [optimisticFavourites, applyOptimistic] = useOptimistic(
    favourites as OptimisticFavourite[],
    applyFavouritesAction,
  );
  const [, startTransition] = useTransition();

  function handleSearch(term: string) {
    setSearch(term);
    setDialogOpen(true);
  }

  function handleAdd(weather: WeatherResult) {
    setDialogOpen(false);
    const { location, current } = weather;
    startTransition(async () => {
      applyOptimistic({
        type: "add",
        favourite: {
          // Temporary id until the revalidated list streams back.
          id: `optimistic:${location.lat},${location.lon}`,
          name: location.name,
          country: location.country,
          ...(location.state !== undefined && { state: location.state }),
          lat: location.lat,
          lon: location.lon,
          sortOrder: null,
          createdAt: new Date().toISOString(),
          // The search result's conditions are in hand — no weather gap.
          current,
          pending: true,
        },
      });
      const result = await addFavouriteAction({
        name: location.name,
        country: location.country,
        ...(location.state !== undefined && { state: location.state }),
        lat: location.lat,
        lon: location.lon,
      });
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "remove", id });
      const result = await removeFavouriteAction(id);
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  }

  function handleReorder(ids: string[]) {
    startTransition(async () => {
      applyOptimistic({ type: "reorder", ids });
      const result = await reorderFavouritesAction(ids);
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  }

  function isSaved(lat: number, lon: number): boolean {
    // Coordinates are the favourite's identity — they come from the same
    // cached geocode on both sides, so exact equality is safe.
    return optimisticFavourites.some((item) => item.lat === lat && item.lon === lon);
  }

  return (
    <div className="flex flex-col gap-6">
      <WeatherSearch search={search} onSubmit={handleSearch} />
      <SearchResultDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        search={search}
        isSignedIn={isSignedIn}
        isSaved={isSaved}
        onAdd={handleAdd}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <FavouritesBoard
          favourites={optimisticFavourites}
          isSignedIn={isSignedIn}
          onRemove={handleRemove}
          onReorder={handleReorder}
        />
        <div className="flex flex-col gap-6">
          <SearchHistory isSignedIn={isSignedIn} onSelect={handleSearch} />
        </div>
      </div>
    </div>
  );
}
