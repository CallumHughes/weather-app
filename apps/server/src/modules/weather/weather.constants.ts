/**
 * Cache TTLs and key builders for the weather module.
 *
 * Keys are versioned (`v1`) so a change to the cached shape can bust the
 * cache by bumping the version instead of flushing the table.
 */

/** Geocoding results barely change — cache resolved locations for 24 h. */
export const GEOCODE_TTL_SECONDS = 24 * 60 * 60;

/** Current weather is fresh enough for 10 min (see ARCHITECTURE.md assumptions). */
export const WEATHER_TTL_SECONDS = 10 * 60;

/** Key for a geocode lookup, normalised so "London " and "london" share an entry. */
export function geocodeCacheKey(query: string): string {
  return `geo:v1:${query.trim().toLowerCase()}`;
}

/**
 * Key for current weather at coordinates, rounded to 2 dp (~1 km granularity)
 * so nearby lookups share an entry. v2: the payload is the `current` block
 * only (no location), so free-text and by-coords lookups share entries.
 */
export function weatherCacheKey(lat: number, lon: number): string {
  return `wx:v2:${lat.toFixed(2)}:${lon.toFixed(2)}`;
}
