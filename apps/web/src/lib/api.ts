/**
 * Typed fetch wrapper for the backend API. The browser only ever calls
 * relative `/api/*` paths — the Next.js BFF rewrite forwards them to the
 * Fastify server, so no server URL (and no API key) ever reaches the client.
 *
 * Types and runtime validation both come from @weather-app/schemas — the same
 * zod schemas the server validates and serializes every response with — so
 * the client's view of the contract cannot drift from the server's. A drifted
 * response fails the parse loudly instead of lying to TypeScript.
 */

import { type ErrorCode, errorEnvelopeSchema } from "@weather-app/schemas/errors";
import type { FavouriteCreate, FavouriteItem } from "@weather-app/schemas/favourites";
import { type HistoryItem, historyListResponseSchema } from "@weather-app/schemas/history";
import {
  type CurrentWeather,
  type WeatherResponse,
  weatherResponseSchema,
} from "@weather-app/schemas/weather";

export type { CurrentWeather, FavouriteItem, HistoryItem, WeatherResponse };

/** The resolved location of a weather result — the body of POST /api/v1/favourites. */
export type FavouriteLocationInput = FavouriteCreate;

/** A favourite plus its server-fetched conditions (null when the fetch failed). */
export type FavouriteWithWeather = FavouriteItem & {
  current: CurrentWeather | null;
  cache?: WeatherCacheStatus;
};

/**
 * Error codes the API can return in its `{ error: { code, message } }`
 * envelope. The server's own union, kept open (`string & {}`) so a code added
 * server-side degrades gracefully here instead of failing to type-check.
 */
export type ApiErrorCode = ErrorCode | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function parseErrorEnvelope(response: Response): Promise<ApiError> {
  let code: ApiErrorCode = "INTERNAL_ERROR";
  let message = "Something went wrong.";
  try {
    const parsed = errorEnvelopeSchema.safeParse(await response.json());
    if (parsed.success) {
      ({ code, message } = parsed.data.error);
    }
  } catch {
    // Non-JSON error body — keep the generic message.
  }
  return new ApiError(response.status, code, message);
}

/** Cache verdict from the server's `x-cache` response header. */
export type WeatherCacheStatus = "HIT" | "MISS" | "STALE";

/** The weather DTO plus client-side response metadata (cache verdict). */
export type WeatherResult = WeatherResponse & { cache?: WeatherCacheStatus };

export function parseCacheHeader(value: string | null): WeatherCacheStatus | undefined {
  return value === "HIT" || value === "MISS" || value === "STALE" ? value : undefined;
}

export async function getWeather(location: string): Promise<WeatherResult> {
  const response = await fetch(`/api/v1/weather?location=${encodeURIComponent(location)}`);
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
  const body = weatherResponseSchema.parse(await response.json());
  const cache = parseCacheHeader(response.headers.get("x-cache"));
  return cache === undefined ? body : { ...body, cache };
}

/**
 * The user's recent searches (newest first, at most 5). Requires a
 * session — the history panel is only rendered when signed in, so a 401
 * here is an edge case surfaced as a plain error state (no toast/redirect).
 */
export async function getHistory(): Promise<HistoryItem[]> {
  const response = await fetch("/api/v1/history");
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
  return historyListResponseSchema.parse(await response.json());
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const response = await fetch(`/api/v1/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
}
