"use client";

import { Alert, AlertDescription, AlertTitle } from "@weather-app/ui/components/alert";
import { Button } from "@weather-app/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@weather-app/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@weather-app/ui/components/input-group";
import { CloudOff, CloudSun, Loader2, MapPinOff, RefreshCw, Search } from "lucide-react";
import { useState } from "react";

import { useAddFavourite, useFavourites, useRemoveFavourite } from "@/hooks/use-favourites";
import { useWeather } from "@/hooks/use-weather";
import { ApiError } from "@/lib/api";

import { WeatherCard, type WeatherCardFavourite } from "./weather-card";
import { WeatherSkeleton } from "./weather-skeleton";

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "LOCATION_NOT_FOUND" || error.status === 404);
}

export interface WeatherSearchProps {
  /** The submitted search — lifted so the history panel can re-run searches. */
  search: string;
  onSearchChange: (next: string) => void;
  /** Signed-in searches refresh the history panel after a successful fetch. */
  isSignedIn?: boolean;
  /** Chip row (mobile favourites) rendered between the search bar and the result. */
  chips?: React.ReactNode;
  /** Sidebar content rendered in the right column on desktop, stacked below on mobile. */
  sidebar?: React.ReactNode;
}

export function WeatherSearch({
  search,
  onSearchChange,
  isSignedIn = false,
  chips,
  sidebar,
}: WeatherSearchProps) {
  const [input, setInput] = useState(search);
  // Sync the input field when something else (the history panel) sets the
  // search — the "adjust state during render" pattern, no effect needed.
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setInput(search);
  }

  const query = useWeather(search, { isSignedIn });

  // Star toggle for the current result. The list query is shared with the
  // Favourites panel (same query key) and disabled while signed out, so
  // signed-out visitors never trigger a favourites fetch.
  const favourites = useFavourites(isSignedIn);
  const addFavourite = useAddFavourite();
  const removeFavourite = useRemoveFavourite();

  let favouriteAction: WeatherCardFavourite | undefined;
  if (isSignedIn && query.isSuccess) {
    const location = query.data.location;
    // Coordinates are the favourite's identity — they come from the same
    // cached geocode on both sides, so exact equality is safe.
    const existing = favourites.data?.find(
      (item) => item.lat === location.lat && item.lon === location.lon,
    );
    favouriteAction = {
      isFavourite: Boolean(existing),
      isPending: addFavourite.isPending || removeFavourite.isPending,
      onToggle: () => {
        if (existing) {
          removeFavourite.mutate(existing.id);
        } else {
          addFavourite.mutate({
            name: location.name,
            country: location.country,
            ...(location.state !== undefined && { state: location.state }),
            lat: location.lat,
            lon: location.lon,
          });
        }
      },
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = input.trim();
    if (next) {
      onSearchChange(next);
    }
  }

  let result: React.ReactNode;
  if (query.isFetching) {
    // Loading: skeleton mirroring the card layout.
    result = <WeatherSkeleton />;
  } else if (query.isError && isNotFound(query.error)) {
    // Not found: a normal outcome — warning-toned, not destructive. The theme
    // has no warning token, so amber utilities are the agreed exception.
    result = (
      <Alert
        data-testid="weather-not-found"
        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      >
        <MapPinOff aria-hidden="true" />
        <AlertTitle>Couldn’t find “{search}”</AlertTitle>
        <AlertDescription className="text-amber-700/90 dark:text-amber-400/90">
          Check the spelling or try a nearby city.
        </AlertDescription>
      </Alert>
    );
  } else if (query.isError) {
    // Error: network / validation / upstream failure, with a working Retry.
    result = (
      <div data-testid="weather-error" className="flex flex-col items-start gap-3">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CloudOff aria-hidden="true" />
          <AlertTitle>Weather service unavailable</AlertTitle>
          <AlertDescription>Couldn’t reach the forecast provider.</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  } else if (query.isSuccess) {
    // Success: the weather card (with the favourite star when signed in).
    result = <WeatherCard weather={query.data} favourite={favouriteAction} />;
  } else {
    // Initial/empty: nothing searched yet.
    result = (
      <Empty className="border border-dashed" data-testid="weather-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CloudSun aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Search for a location</EmptyTitle>
          <EmptyDescription>Try a city name.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" onClick={() => onSearchChange("Manchester")}>
            Try Manchester
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id="weather-location"
            name="location"
            type="text"
            aria-label="City"
            placeholder="Search for a city…"
            autoComplete="off"
            maxLength={100}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </InputGroup>
        <Button type="submit" disabled={query.isFetching}>
          {query.isFetching && <Loader2 aria-hidden="true" className="animate-spin" />}
          Search
        </Button>
      </form>
      {chips}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div aria-live="polite">{result}</div>
        {sidebar && <div className="flex flex-col gap-6">{sidebar}</div>}
      </div>
    </div>
  );
}
