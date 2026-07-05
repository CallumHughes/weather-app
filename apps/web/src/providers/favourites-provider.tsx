"use client";

import { createContext, useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import {
  addFavouriteAction,
  removeFavouriteAction,
  reorderFavouritesAction,
} from "@/app/actions/favourites";
import type { FavouriteWithWeather, WeatherResult } from "@/lib/api";

/** A favourite as held in optimistic state: pending until the action lands. */
export type OptimisticFavourite = FavouriteWithWeather & { pending?: boolean };

/**
 * Shared-element id linking a location across surfaces (search dialog →
 * board). Keyed by coordinates — the favourite's identity — rather than the
 * row id, which changes when the optimistic row is replaced by the real one.
 */
export function favouriteLayoutId(lat: number, lon: number): string {
  return `favourite:${lat}:${lon}`;
}

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

export interface FavouritesContextValue {
  /** Optimistic favourites in display order. */
  favourites: OptimisticFavourite[];
  /** True when the coordinates are already in the (optimistic) list. */
  isSaved: (lat: number, lon: number) => boolean;
  /** Optimistically prepend the search result, then persist it. */
  addFavourite: (weather: WeatherResult) => void;
  removeFavourite: (id: string) => void;
  /** Persist a new display order (complete id list). */
  reorderFavourites: (ids: string[]) => void;
}

/** Consumed via useFavourites (hooks/use-favourites.ts). */
export const FavouritesContext = createContext<FavouritesContextValue | null>(null);

export interface FavouritesProviderProps {
  /** Server-fetched favourites (with weather) in display order. */
  favourites: FavouriteWithWeather[];
  children: React.ReactNode;
}

/**
 * Owns the optimistic favourites list and the server actions that mutate it:
 * the search dialog adds to it, the board removes and reorders. Failures
 * toast and let the optimistic state revert to the server list.
 */
export function FavouritesProvider({ favourites, children }: FavouritesProviderProps) {
  const [optimisticFavourites, applyOptimistic] = useOptimistic(
    favourites as OptimisticFavourite[],
    applyFavouritesAction,
  );
  const [, startTransition] = useTransition();

  function addFavourite(weather: WeatherResult) {
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

  function removeFavourite(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "remove", id });
      const result = await removeFavouriteAction(id);
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  }

  function reorderFavourites(ids: string[]) {
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
    <FavouritesContext.Provider
      value={{
        favourites: optimisticFavourites,
        isSaved,
        addFavourite,
        removeFavourite,
        reorderFavourites,
      }}
    >
      {children}
    </FavouritesContext.Provider>
  );
}
