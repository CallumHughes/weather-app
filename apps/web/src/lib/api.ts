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

/** Error codes the API can return in its `{ error: { code, message } }` envelope. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "LOCATION_NOT_FOUND"
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
  let message = "Something went wrong fetching the weather.";
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

export async function getWeather(location: string): Promise<WeatherResponse> {
  const response = await fetch(`/api/v1/weather?location=${encodeURIComponent(location)}`);
  if (!response.ok) {
    throw await parseErrorEnvelope(response);
  }
  return (await response.json()) as WeatherResponse;
}
