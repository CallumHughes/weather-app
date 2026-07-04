"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import { FavouriteChips } from "./favourite-chips";
import { Favourites } from "./favourites";
import { SearchHistory } from "./search-history";
import { WeatherSearch } from "./weather-search";

/**
 * Owns the "current search" state so the form and the side panels drive the
 * same search: clicking a history row, a favourite, or a mobile favourite
 * chip re-runs it through WeatherSearch.
 */
export function WeatherHome() {
  const [search, setSearch] = useState("");
  const { data: session } = authClient.useSession();

  return (
    <WeatherSearch
      search={search}
      onSearchChange={setSearch}
      isSignedIn={Boolean(session)}
      chips={<FavouriteChips onSelect={setSearch} />}
      sidebar={
        <>
          {/* Hidden on mobile: the chip row under the search bar already
              shows favourites there. */}
          <div className="hidden lg:block">
            <Favourites onSelect={setSearch} />
          </div>
          <SearchHistory onSelect={setSearch} />
        </>
      }
    />
  );
}
