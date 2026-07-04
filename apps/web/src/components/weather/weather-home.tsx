"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import { Favourites } from "./favourites";
import { SearchHistory } from "./search-history";
import { WeatherSearch } from "./weather-search";

/**
 * Owns the "current search" state so the form and the side panels drive the
 * same search: clicking a history row or a favourite re-runs it through
 * WeatherSearch.
 */
export function WeatherHome() {
  const [search, setSearch] = useState("");
  const { data: session } = authClient.useSession();

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <WeatherSearch search={search} onSearchChange={setSearch} isSignedIn={Boolean(session)} />
      {/* Panels: stacked on mobile, side by side at tablet widths, stacked
          again inside the desktop side rail. */}
      <div className="grid items-start gap-8 sm:grid-cols-2 lg:grid-cols-1">
        <Favourites onSelect={setSearch} />
        <SearchHistory onSelect={setSearch} />
      </div>
    </div>
  );
}
