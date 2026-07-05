import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  currentWeatherLondonFixture,
  expectedLondonDto,
} from "@/modules/weather/openweather.fixtures";
import { toCurrentWeather } from "@/modules/weather/weather.service";

describe("toCurrentWeather", () => {
  it("maps the upstream current weather shape to the client DTO", () => {
    expect(toCurrentWeather(currentWeatherLondonFixture)).toEqual(expectedLondonDto.current);
  });

  it("converts the upstream unix `dt` to an ISO 8601 `observedAt`", () => {
    const dto = toCurrentWeather({ ...currentWeatherLondonFixture, dt: 0 });
    expect(dto.observedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("throws an upstream AppError when the weather array is empty", () => {
    expect(() => toCurrentWeather({ ...currentWeatherLondonFixture, weather: [] })).toThrowError(
      AppError,
    );
  });
});
