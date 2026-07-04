import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { londonWeatherFixture } from "./weather.fixtures";
import { WeatherCard } from "./weather-card";

describe("WeatherCard", () => {
  it("renders every field from the DTO", () => {
    render(<WeatherCard weather={londonWeatherFixture} />);

    // Resolved location (name + state + country)
    expect(screen.getByText("London, England, GB")).toBeInTheDocument();

    // Temperature and feels-like (rounded)
    expect(screen.getByText("18°C")).toBeInTheDocument();
    expect(screen.getByText("Feels like")).toBeInTheDocument();
    expect(screen.getByText("17°C")).toBeInTheDocument();

    // Condition description + OpenWeather icon
    expect(screen.getByText("broken clouds")).toBeInTheDocument();
    const icon = screen.getByRole("img", { name: "broken clouds" });
    expect(icon).toHaveAttribute("src", "https://openweathermap.org/img/wn/04d@2x.png");

    // Humidity and wind
    expect(screen.getByText("Humidity")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("Wind")).toBeInTheDocument();
    expect(screen.getByText("4.1 m/s")).toBeInTheDocument();

    // Observation time
    expect(screen.getByText(/Observed at/)).toBeInTheDocument();
  });

  it("omits the state when the location has none", () => {
    const { location, current } = londonWeatherFixture;
    const { state: _state, ...locationWithoutState } = location;
    render(<WeatherCard weather={{ location: locationWithoutState, current }} />);

    expect(screen.getByText("London, GB")).toBeInTheDocument();
  });
});
