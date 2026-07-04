"use client";

import { useQuery } from "@tanstack/react-query";

import { getWeather } from "@/lib/api";

/**
 * Fetch current weather for a searched location.
 * Disabled until a non-empty location has been submitted.
 */
export function useWeather(location: string) {
  const normalized = location.toLowerCase().trim();

  return useQuery({
    queryKey: ["weather", normalized],
    queryFn: () => getWeather(location.trim()),
    enabled: normalized !== "",
  });
}
