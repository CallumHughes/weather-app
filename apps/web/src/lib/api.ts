/**
 * Typed fetch wrapper for the backend API. The browser only ever calls
 * relative `/api/*` paths — the Next.js BFF rewrite forwards them to the
 * Fastify server, so no server URL (and no API key) ever reaches the client.
 */

export interface WeatherResponse {
  location: {
    name: string;
    country: string;
    state?: string;
    lat: number;
    lon: number;
  };
  current: {
    temperatureC: number;
    feelsLikeC: number;
    humidityPct: number;
    windSpeedMs: number;
    condition: {
      id: number;
      main: string;
      description: string;
      icon: string;
    };
    /** ISO 8601 timestamp of the upstream observation. */
    observedAt: string;
  };
}

/** A search-history entry as returned by GET /api/v1/history. */
export interface HistoryItem {
  id: string;
  /** The raw (trimmed) text the user searched for. */
  query: string;
  resolvedName: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
  /** ISO 8601 timestamp of the (most recent) search. */
  createdAt: string;
}

/** The resolved location of a weather result — the body of POST /api/v1/favourites. */
export interface FavouriteLocationInput {
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
}

/** A favourite location as returned by GET /api/v1/favourites. */
export interface FavouriteItem {
  id: string;
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
  /** Manual sort position; null until reordering exists. */
  sortOrder: number | null;
  /** ISO 8601 timestamp of when the favourite was saved. */
  createdAt: string;
}

/** Error codes the API can return in its `{ error: { code, message } }` envelope. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "LOCATION_NOT_FOUND"
  | "ALREADY_FAVOURITE"
  | "FAVOURITES_LIMIT_REACHED"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_TIMEOUT"
  | "INTERNAL_ERROR"
  | (string & {});

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

async function parseErrorEnvelope(response: Response): Promise<ApiError> {
  let code: ApiErrorCode = "INTERNAL_ERROR";
  let message = "Something went wrong.";
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "code" in body.error &&
      "message" in body.error &&
      typeof body.error.code === "string" &&
      typeof body.error.message === "string"
    ) {
      code = body.error.code;
      message = body.error.message;
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

function parseCacheHeader(value: string | null): WeatherCacheStatus | undefined {
  return value === "HIT" || value === "MISS" || value === "STALE" ? value : undefined;
}

export async function getWeather(location: string): Promise<WeatherResult> {
  const response = await fetch(`/api/v1/weather?location=${encodeURIComponent(location)}`);
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
  const body = (await response.json()) as WeatherResponse;
  const cache = parseCacheHeader(response.headers.get("x-cache"));
  return cache === undefined ? body : { ...body, cache };
}

/**
 * The user's recent searches (newest first, at most 10). Requires a
 * session — the history panel is only rendered when signed in, so a 401
 * here is an edge case surfaced as a plain error state (no toast/redirect).
 */
export async function getHistory(): Promise<HistoryItem[]> {
  const response = await fetch("/api/v1/history");
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
  return (await response.json()) as HistoryItem[];
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const response = await fetch(`/api/v1/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
}

/**
 * The user's favourite locations (manually ordered first, then oldest-first).
 * Requires a session — the favourites UI only renders when signed in.
 */
export async function getFavourites(): Promise<FavouriteItem[]> {
  const response = await fetch("/api/v1/favourites");
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
  return (await response.json()) as FavouriteItem[];
}

export async function addFavourite(location: FavouriteLocationInput): Promise<FavouriteItem> {
  const response = await fetch("/api/v1/favourites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location),
  });
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
  return (await response.json()) as FavouriteItem;
}

export async function deleteFavourite(id: string): Promise<void> {
  const response = await fetch(`/api/v1/favourites/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
}
