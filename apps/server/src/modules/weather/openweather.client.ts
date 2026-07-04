import { z } from "zod";

import { AppError, ErrorCodes } from "@/lib/errors";

const GENERIC_UPSTREAM_MESSAGE = "The weather service is currently unavailable. Try again shortly.";
const TIMEOUT_MESSAGE = "The weather service took too long to respond. Try again shortly.";

/**
 * Lenient upstream schemas: only the fields we map. Shape drift fails
 * loudly as UPSTREAM_ERROR instead of sending garbage downstream.
 */
const geocodeResultSchema = z.array(
  z.looseObject({
    name: z.string(),
    lat: z.number(),
    lon: z.number(),
    country: z.string(),
    state: z.string().optional(),
  }),
);

export type GeocodeResult = z.infer<typeof geocodeResultSchema>[number];

const currentWeatherSchema = z.looseObject({
  main: z.looseObject({
    temp: z.number(),
    feels_like: z.number(),
    humidity: z.number(),
  }),
  weather: z
    .array(
      z.looseObject({
        id: z.number(),
        main: z.string(),
        description: z.string(),
        icon: z.string(),
      }),
    )
    .min(1),
  wind: z.looseObject({ speed: z.number() }),
  dt: z.number(),
  name: z.string(),
});

export type CurrentWeatherResult = z.infer<typeof currentWeatherSchema>;

export interface OpenWeatherClientOptions {
  apiKey: string;
  /** Request timeout in milliseconds (injectable for tests). */
  timeoutMs?: number;
  baseUrl?: string;
}

export class OpenWeatherClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: OpenWeatherClientOptions) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.baseUrl = options.baseUrl ?? "https://api.openweathermap.org";
  }

  async geocode(query: string, limit = 1): Promise<GeocodeResult[]> {
    const url = new URL("/geo/1.0/direct", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    const body = await this.request(url);
    return this.parse(geocodeResultSchema, body, "geocoding");
  }

  async getCurrentWeather(lat: number, lon: number): Promise<CurrentWeatherResult> {
    const url = new URL("/data/2.5/weather", this.baseUrl);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("units", "metric");
    const body = await this.request(url);
    return this.parse(currentWeatherSchema, body, "current weather");
  }

  /**
   * Fetch an OpenWeather endpoint and return the parsed JSON body.
   * Never surfaces upstream URLs, the API key, or raw upstream bodies
   * in thrown (client-facing) messages.
   */
  private async request(url: URL): Promise<unknown> {
    url.searchParams.set("appid", this.apiKey);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (cause) {
      if (
        cause instanceof Error &&
        (cause.name === "TimeoutError" || cause.name === "AbortError")
      ) {
        throw new AppError(504, ErrorCodes.UPSTREAM_TIMEOUT, TIMEOUT_MESSAGE);
      }
      throw new AppError(502, ErrorCodes.UPSTREAM_ERROR, GENERIC_UPSTREAM_MESSAGE);
    }

    if (!response.ok) {
      // 401 means a misconfigured/inactive API key — call it out in the logs
      // (the error handler logs AppError causes), but keep the client message generic.
      const detail =
        response.status === 401
          ? "OpenWeather rejected the API key (401). Check OPENWEATHER_API_KEY — new keys can take a while to activate."
          : `OpenWeather responded with status ${response.status}.`;
      const error = new AppError(502, ErrorCodes.UPSTREAM_ERROR, GENERIC_UPSTREAM_MESSAGE);
      error.cause = new Error(detail);
      throw error;
    }

    try {
      return await response.json();
    } catch {
      throw new AppError(502, ErrorCodes.UPSTREAM_ERROR, GENERIC_UPSTREAM_MESSAGE);
    }
  }

  private parse<T extends z.ZodType>(schema: T, body: unknown, what: string): z.output<T> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const error = new AppError(502, ErrorCodes.UPSTREAM_ERROR, GENERIC_UPSTREAM_MESSAGE);
      error.cause = new Error(`Unexpected ${what} response shape: ${parsed.error.message}`);
      throw error;
    }
    return parsed.data;
  }
}
