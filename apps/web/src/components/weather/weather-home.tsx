"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import { SearchHistory } from "./search-history";
import { WeatherSearch } from "./weather-search";

/**
 * Owns the "current search" state so the form and the history panel drive
 * the same search: clicking a history row re-runs it through WeatherSearch.
 */
export function WeatherHome() {
  const [search, setSearch] = useState("");
  const { data: session } = authClient.useSession();

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <WeatherSearch search={search} onSearchChange={setSearch} isSignedIn={Boolean(session)} />
      <SearchHistory onSelect={setSearch} />
    </div>
  );
}
