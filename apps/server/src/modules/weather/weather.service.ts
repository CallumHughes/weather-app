import { AppError, ErrorCodes } from "@/lib/errors";
import type {
  CurrentWeatherResult,
  GeocodeResult,
  OpenWeatherClient,
} from "@/modules/weather/openweather.client";
import type { WeatherResponse } from "@/modules/weather/weather.schemas";

/** Map upstream shapes to the client-facing DTO (never leak upstream shapes). */
export function toWeatherResponse(
  geo: GeocodeResult,
  weather: CurrentWeatherResult,
): WeatherResponse {
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
    location: {
      name: geo.name,
      country: geo.country,
      ...(geo.state !== undefined && { state: geo.state }),
      lat: geo.lat,
      lon: geo.lon,
    },
    current: {
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
    },
  };
}

export class WeatherService {
  constructor(private readonly client: OpenWeatherClient) {}

  async getCurrentWeather(location: string): Promise<WeatherResponse> {
    const results = await this.client.geocode(location, 1);
    const match = results[0];
    if (!match) {
      throw new AppError(
        404,
        ErrorCodes.LOCATION_NOT_FOUND,
        `No location found matching "${location}".`,
      );
    }
    const weather = await this.client.getCurrentWeather(match.lat, match.lon);
    return toWeatherResponse(match, weather);
  }
}
