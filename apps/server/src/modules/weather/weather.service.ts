import type { z } from "zod";

import type { CacheStore } from "@/lib/cache";
import { AppError, ErrorCodes } from "@/lib/errors";
import type {
  CurrentWeatherResult,
  GeocodeResult,
  OpenWeatherClient,
} from "@/modules/weather/openweather.client";
import {
  GEOCODE_TTL_SECONDS,
  geocodeCacheKey,
  WEATHER_TTL_SECONDS,
  weatherCacheKey,
} from "@/modules/weather/weather.constants";
import {
  type CachedGeocode,
  type CurrentWeather,
  cachedGeocodeSchema,
  currentWeatherSchema,
  type WeatherResponse,
} from "@/modules/weather/weather.schemas";

/** How the weather cache behaved for a request; surfaced as `x-cache`. */
export type CacheOutcome = "HIT" | "MISS" | "STALE";

export interface WeatherResult {
  data: WeatherResponse;
  cache: CacheOutcome;
}

export interface CurrentWeatherByCoordsResult {
  data: CurrentWeather;
  cache: CacheOutcome;
}

/** Map upstream shapes to the client-facing DTO (never leak upstream shapes). */
export function toCurrentWeather(weather: CurrentWeatherResult): CurrentWeather {
  const condition = weather.weather[0];
  if (!condition) {
    // Guarded upstream by the zod schema (`weather` array min length 1);
    // kept here so the mapping is safe in isolation too.
    throw new AppError(
      502,
      ErrorCodes.UPSTREAM_ERROR,
      "The weather service is currently unavailable. Try again shortly.",
    );
  }
  return {
    temperatureC: weather.main.temp,
    feelsLikeC: weather.main.feels_like,
    humidityPct: weather.main.humidity,
    windSpeedMs: weather.wind.speed,
    condition: {
      id: condition.id,
      main: condition.main,
      description: condition.description,
      icon: condition.icon,
    },
    observedAt: new Date(weather.dt * 1000).toISOString(),
  };
}

/** 502/504 upstream failures are the only errors eligible for the stale fallback. */
function isUpstreamFailure(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === ErrorCodes.UPSTREAM_ERROR || error.code === ErrorCodes.UPSTREAM_TIMEOUT)
  );
}

/**
 * Read from the cache and re-validate the payload against its zod schema:
 * a stale/corrupt cached payload degrades to a cache miss, never a 500.
 */
async function readValidated<S extends z.ZodType>(
  read: () => Promise<unknown>,
  schema: S,
): Promise<z.output<S> | null> {
  const value = await read();
  if (value == null) {
    return null;
  }
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class WeatherService {
  constructor(
    private readonly client: OpenWeatherClient,
    private readonly cache: CacheStore,
  ) {}

  async getCurrentWeather(location: string): Promise<WeatherResult> {
    const geo = await this.resolveLocation(location);
    const { data: current, cache } = await this.getCurrentByCoords(geo.lat, geo.lon);
    return {
      data: {
        location: {
          name: geo.name,
          country: geo.country,
          ...(geo.state !== undefined && { state: geo.state }),
          lat: geo.lat,
          lon: geo.lon,
        },
        current,
      },
      cache,
    };
  }

  /** Current conditions for known coordinates — no geocoding, no location in the DTO. */
  async getCurrentByCoords(lat: number, lon: number): Promise<CurrentWeatherByCoordsResult> {
    const key = weatherCacheKey(lat, lon);
    const cached = await readValidated(() => this.cache.get(key), currentWeatherSchema);
    if (cached) {
      return { data: cached, cache: "HIT" };
    }

    let weather: CurrentWeatherResult;
    try {
      weather = await this.client.getCurrentWeather(lat, lon);
    } catch (error) {
      // Stale-on-upstream-failure: serve an expired entry over a 502/504.
      if (isUpstreamFailure(error)) {
        const stale = await readValidated(() => this.cache.getStale(key), currentWeatherSchema);
        if (stale) {
          return { data: stale, cache: "STALE" };
        }
      }
      throw error;
    }

    const data = toCurrentWeather(weather);
    await this.cache.set(key, data, WEATHER_TTL_SECONDS);
    return { data, cache: "MISS" };
  }

  /** Resolve a free-text location via the geocode cache, then upstream. */
  private async resolveLocation(location: string): Promise<CachedGeocode> {
    const key = geocodeCacheKey(location);
    const cached = await readValidated(() => this.cache.get(key), cachedGeocodeSchema);
    if (cached) {
      return cached;
    }

    let results: GeocodeResult[];
    try {
      results = await this.client.geocode(location, 1);
    } catch (error) {
      if (isUpstreamFailure(error)) {
        const stale = await readValidated(() => this.cache.getStale(key), cachedGeocodeSchema);
        if (stale) {
          return stale;
        }
      }
      throw error;
    }

    const match = results[0];
    if (!match) {
      throw new AppError(
        404,
        ErrorCodes.LOCATION_NOT_FOUND,
        `No location found matching "${location}".`,
      );
    }

    const entry: CachedGeocode = {
      name: match.name,
      country: match.country,
      ...(match.state !== undefined && { state: match.state }),
      lat: match.lat,
      lon: match.lon,
    };
    await this.cache.set(key, entry, GEOCODE_TTL_SECONDS);
    return entry;
  }
}
