import { afterEach, describe, expect, it, vi } from "vitest";

import { londonWeatherFixture } from "@/components/weather.fixtures";

import { getWeather } from "./api";

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("getWeather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    "HIT",
    "MISS",
    "STALE",
  ] as const)("returns the x-cache header verdict %s alongside the DTO", async (verdict) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(londonWeatherFixture, { "x-cache": verdict })),
    );

    const result = await getWeather("London");

    expect(result.cache).toBe(verdict);
    expect(result.location.name).toBe("London");
  });

  it("omits the cache verdict when the header is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(londonWeatherFixture)));

    const result = await getWeather("London");

    expect(result.cache).toBeUndefined();
  });

  it("omits the cache verdict when the header value is unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(londonWeatherFixture, { "x-cache": "BANANA" })),
    );

    const result = await getWeather("London");

    expect(result.cache).toBeUndefined();
  });
});
