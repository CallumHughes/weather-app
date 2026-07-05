import type { WeatherResponse } from "@/lib/api";

/** DTO fixture matching the shape returned by GET /api/v1/weather. */
export const londonWeatherFixture: WeatherResponse = {
  location: {
    name: "London",
    country: "GB",
    state: "England",
    lat: 51.5073219,
    lon: -0.1276474,
  },
  current: {
    temperatureC: 18.2,
    feelsLikeC: 17.4,
    humidityPct: 62,
    windSpeedMs: 4.1,
    condition: { id: 803, main: "Clouds", description: "broken clouds", icon: "04d" },
    observedAt: "2025-07-04T10:20:00.000Z",
  },
};
