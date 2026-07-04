/**
 * OpenWeather response fixtures for tests, mirroring real API payloads
 * (including fields we do not map, to exercise the lenient schemas).
 */

export const geocodeLondonEntryFixture = {
  name: "London",
  local_names: { en: "London", fr: "Londres" },
  lat: 51.5073219,
  lon: -0.1276474,
  country: "GB",
  state: "England",
};

/** GET /geo/1.0/direct?q=London&limit=1 */
export const geocodeLondonFixture = [geocodeLondonEntryFixture];

/** GET /data/2.5/weather?lat=51.5073219&lon=-0.1276474&units=metric */
export const currentWeatherLondonFixture = {
  coord: { lon: -0.1276, lat: 51.5073 },
  weather: [{ id: 803, main: "Clouds", description: "broken clouds", icon: "04d" }],
  base: "stations",
  main: {
    temp: 18.2,
    feels_like: 17.4,
    temp_min: 16.1,
    temp_max: 19.8,
    pressure: 1012,
    humidity: 62,
  },
  visibility: 10000,
  wind: { speed: 4.1, deg: 200 },
  clouds: { all: 75 },
  // 2025-07-04T10:20:00.000Z
  dt: 1751624400,
  sys: { type: 2, id: 2075535, country: "GB", sunrise: 1751600400, sunset: 1751659800 },
  timezone: 3600,
  id: 2643743,
  name: "London",
  cod: 200,
};

/** The DTO the API is expected to produce from the two fixtures above. */
export const expectedLondonDto = {
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
