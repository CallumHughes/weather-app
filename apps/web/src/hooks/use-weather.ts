"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { HISTORY_QUERY_KEY } from "@/hooks/use-history";
import { getWeather } from "@/lib/api";

/**
 * Fetch current weather for a searched location.
 * Disabled until a non-empty location has been submitted.
 */
export function useWeather(
  location: string,
  { isSignedIn = false }: { isSignedIn?: boolean } = {},
) {
  const normalized = location.toLowerCase().trim();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["weather", normalized],
    queryFn: () => getWeather(location.trim()),
    enabled: normalized !== "",
  });

  // A successful fetch while signed in means the server just recorded the
  // search — refresh the history panel. (dataUpdatedAt re-triggers this on
  // refetches of the same location.)
  const { isSuccess, dataUpdatedAt } = query;
  useEffect(() => {
    if (isSuccess && isSignedIn && dataUpdatedAt > 0) {
      queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    }
  }, [isSuccess, isSignedIn, dataUpdatedAt, queryClient]);

  return query;
}
