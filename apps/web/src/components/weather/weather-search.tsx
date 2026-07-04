"use client";

import { Button } from "@weather-app/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@weather-app/ui/components/empty";
import { Input } from "@weather-app/ui/components/input";
import { Label } from "@weather-app/ui/components/label";
import { CloudSun, Loader2, SearchX, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { useWeather } from "@/hooks/use-weather";
import { ApiError } from "@/lib/api";

import { WeatherCard } from "./weather-card";
import { WeatherSkeleton } from "./weather-skeleton";

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "LOCATION_NOT_FOUND" || error.status === 404);
}

export function WeatherSearch() {
  const [input, setInput] = useState("");
  const [searched, setSearched] = useState("");
  const query = useWeather(searched);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = input.trim();
    if (next) {
      setSearched(next);
    }
  }

  let result: React.ReactNode;
  if (query.isFetching) {
    // Loading: skeleton mirroring the card layout.
    result = <WeatherSkeleton />;
  } else if (query.isError && isNotFound(query.error)) {
    // Not found: a normal outcome, styled neutrally (no red).
    result = (
      <Empty className="border" data-testid="weather-not-found">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No results for ‘{searched}’</EmptyTitle>
          <EmptyDescription>
            We couldn’t find ‘{searched}’. Check the spelling or try a nearby city.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (query.isError) {
    // Error: network / validation / upstream failure, with a working Retry.
    result = (
      <div
        data-testid="weather-error"
        className="flex flex-col items-center gap-3 border border-destructive/40 bg-destructive/10 p-6 text-center"
      >
        <TriangleAlert aria-hidden="true" className="size-5 text-destructive" />
        <p className="font-medium text-destructive text-sm">
          Something went wrong fetching the weather.
        </p>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (query.isSuccess) {
    // Success: the weather card.
    result = <WeatherCard weather={query.data} />;
  } else {
    // Initial/empty: nothing searched yet.
    result = (
      <Empty className="border border-dashed" data-testid="weather-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CloudSun aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Search for a city</EmptyTitle>
          <EmptyDescription>
            Enter a city name above to see the current weather there.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="weather-location">City</Label>
        <div className="flex gap-2">
          <Input
            id="weather-location"
            name="location"
            type="text"
            placeholder="e.g. London"
            autoComplete="off"
            maxLength={100}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button type="submit" disabled={query.isFetching}>
            {query.isFetching && <Loader2 aria-hidden="true" className="animate-spin" />}
            Search
          </Button>
        </div>
      </form>
      <div aria-live="polite">{result}</div>
    </div>
  );
}
