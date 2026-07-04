import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  currentWeatherLondonFixture,
  expectedLondonDto,
  geocodeLondonEntryFixture as geoLondon,
} from "@/modules/weather/openweather.fixtures";
import { toWeatherResponse } from "@/modules/weather/weather.service";

describe("toWeatherResponse", () => {
  it("maps upstream geocode + current weather shapes to the client DTO", () => {
    expect(toWeatherResponse(geoLondon, currentWeatherLondonFixture)).toEqual(expectedLondonDto);
  });

  it("converts the upstream unix `dt` to an ISO 8601 `observedAt`", () => {
    const dto = toWeatherResponse(geoLondon, { ...currentWeatherLondonFixture, dt: 0 });
    expect(dto.current.observedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("omits `state` when the geocode result has none", () => {
    const { state: _state, ...geoWithoutState } = geoLondon;
    const dto = toWeatherResponse(geoWithoutState, currentWeatherLondonFixture);
    expect(dto.location).not.toHaveProperty("state");
    expect(dto.location.name).toBe("London");
  });

  it("throws an upstream AppError when the weather array is empty", () => {
    expect(() =>
      toWeatherResponse(geoLondon, { ...currentWeatherLondonFixture, weather: [] }),
    ).toThrowError(AppError);
  });
});
