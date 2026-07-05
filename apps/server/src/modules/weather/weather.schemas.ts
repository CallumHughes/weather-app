import { z } from "zod";

/** Query params for GET /api/v1/weather */
export const weatherQuerySchema = z.object({
  location: z
    .string()
    .trim()
    .min(1, "location must not be empty")
    .max(100, "location must be at most 100 characters")
    .describe(
      'Free-text place query, e.g. "London", "London,GB" or "Springfield,US-IL". ' +
        "Resolved by geocoding; ambiguous names resolve to the best match.",
    ),
});

export type WeatherQuery = z.infer<typeof weatherQuerySchema>;

/**
 * Shape of a cached geocode entry. Cached payloads are re-validated on read
 * so a stale/corrupt row degrades to a cache miss, never a 500.
 */
export const cachedGeocodeSchema = z.object({
  name: z.string(),
  country: z.string(),
  state: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
});

export type CachedGeocode = z.infer<typeof cachedGeocodeSchema>;

/**
 * The resolved-location fields of the weather DTO. Shared with the favourites
 * module: a favourite *is* one of these resolved locations, so the field
 * schemas must stay identical (coordinates included — see the favourites
 * unique key) rather than being redefined per module.
 */
export const resolvedLocationSchema = z.object({
  name: z.string().describe("Place name the query resolved to"),
  country: z.string().describe("ISO 3166 country code, e.g. GB"),
  state: z.string().optional().describe("State/region, when the geocoder provides one"),
  lat: z.number(),
  lon: z.number(),
});

export type ResolvedLocation = z.infer<typeof resolvedLocationSchema>;

/**
 * Current conditions, independent of how the place was identified. Also the
 * shape stored in the weather cache (keyed by coordinates), so it must not
 * embed location fields.
 */
export const currentWeatherSchema = z.object({
  temperatureC: z.number().describe("Air temperature in °C"),
  feelsLikeC: z.number().describe("Perceived temperature in °C"),
  humidityPct: z.number().describe("Relative humidity in %"),
  windSpeedMs: z.number().describe("Wind speed in m/s"),
  condition: z.object({
    id: z.number().describe("Weather condition id (provider taxonomy)"),
    main: z.string().describe('Condition group, e.g. "Clouds"'),
    description: z.string().describe('Human-readable condition, e.g. "scattered clouds"'),
    icon: z.string().describe("Icon code for the condition"),
  }),
  observedAt: z.iso.datetime().describe("When the reading was observed (ISO 8601, UTC)"),
});

export type CurrentWeather = z.infer<typeof currentWeatherSchema>;

/** Query params for GET /api/v1/weather/current */
export const weatherByCoordsQuerySchema = z.object({
  lat: z.coerce
    .number()
    .min(-90, "lat must be at least -90")
    .max(90, "lat must be at most 90")
    .describe("Latitude in decimal degrees"),
  lon: z.coerce
    .number()
    .min(-180, "lon must be at least -180")
    .max(180, "lon must be at most 180")
    .describe("Longitude in decimal degrees"),
});

export type WeatherByCoordsQuery = z.infer<typeof weatherByCoordsQuerySchema>;

/** Response DTO for GET /api/v1/weather/current — conditions only, no geocoding. */
export const currentWeatherResponseSchema = z.object({
  current: currentWeatherSchema,
});

export type CurrentWeatherResponse = z.infer<typeof currentWeatherResponseSchema>;

/** Response DTO — the only shape the client ever sees. */
export const weatherResponseSchema = z.object({
  location: resolvedLocationSchema.describe("The place the query resolved to"),
  current: currentWeatherSchema,
});

export type WeatherResponse = z.infer<typeof weatherResponseSchema>;

/** Consistent error envelope for every non-2xx response (single source: lib/errors). */
export { type ErrorEnvelope, errorEnvelopeSchema } from "@/lib/errors";
