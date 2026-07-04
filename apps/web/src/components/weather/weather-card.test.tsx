import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { londonWeatherFixture } from "./weather.fixtures";
import { WeatherCard } from "./weather-card";

describe("WeatherCard", () => {
  it("renders every field from the DTO", () => {
    render(<WeatherCard weather={londonWeatherFixture} />);

    // Resolved location (name + state + country)
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();

    // Hero: rounded temperature + condition description + feels-like line
    expect(screen.getByText("18°C")).toBeInTheDocument();
    expect(screen.getByText("broken clouds")).toBeInTheDocument();
    expect(screen.getByText(/feels like 17°/)).toBeInTheDocument();

    // Stat tiles: wind, humidity, feels-like
    expect(screen.getByText("Wind")).toBeInTheDocument();
    expect(screen.getByText("4.1 m/s")).toBeInTheDocument();
    expect(screen.getByText("Humidity")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("Feels like")).toBeInTheDocument();
    expect(screen.getByText("17°C")).toBeInTheDocument();

    // Relative observation time
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });

  it("omits the state when the location has none", () => {
    const { location, current } = londonWeatherFixture;
    const { state: _state, ...locationWithoutState } = location;
    render(<WeatherCard weather={{ location: locationWithoutState, current }} />);

    expect(screen.getByText("London, GB")).toBeInTheDocument();
  });

  it.each(["HIT", "STALE"] as const)("appends '· cached' when the cache verdict is %s", (cache) => {
    render(<WeatherCard weather={{ ...londonWeatherFixture, cache }} />);

    expect(screen.getByText(/· cached/)).toBeInTheDocument();
  });

  it("omits '· cached' on a cache MISS", () => {
    render(<WeatherCard weather={{ ...londonWeatherFixture, cache: "MISS" }} />);

    expect(screen.queryByText(/· cached/)).not.toBeInTheDocument();
  });

  it("omits '· cached' when the cache verdict is unknown", () => {
    render(<WeatherCard weather={londonWeatherFixture} />);

    expect(screen.queryByText(/· cached/)).not.toBeInTheDocument();
  });
});
