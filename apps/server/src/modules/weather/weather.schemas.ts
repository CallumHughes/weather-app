import { z } from "zod";

// The client-facing weather contract (query params + response DTOs) lives in
// @weather-app/schemas so the web app derives its types — and validates
// responses — from the exact schemas these routes serialize with. Re-exported
// here as the module-local home of the weather schemas.
export {
  type CurrentWeather,
  type CurrentWeatherResponse,
  currentWeatherResponseSchema,
  currentWeatherSchema,
  type ResolvedLocation,
  resolvedLocationSchema,
  type WeatherByCoordsQuery,
  type WeatherQuery,
  type WeatherResponse,
  weatherByCoordsQuerySchema,
  weatherQuerySchema,
  weatherResponseSchema,
} from "@weather-app/schemas/weather";

/**
 * Shape of a cached geocode entry. Cached payloads are re-validated on read
 * so a stale/corrupt row degrades to a cache miss, never a 500.
 * Server-internal (cache storage), so it stays out of the shared contract.
 */
export const cachedGeocodeSchema = z.object({
  name: z.string(),
  country: z.string(),
  state: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
});

export type CachedGeocode = z.infer<typeof cachedGeocodeSchema>;
