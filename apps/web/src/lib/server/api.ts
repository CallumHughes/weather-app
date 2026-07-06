/**
 * Server-side fetch helpers for RSCs and server actions. Unlike lib/api.ts
 * (browser, same-origin via the BFF rewrite), these call the Fastify server
 * directly over the private network and must forward the caller's cookie
 * (session) and client IP (per-user rate limiting) themselves.
 */

import { env } from "@weather-app/env/web";
import { favouritesListResponseSchema } from "@weather-app/schemas/favourites";
import { currentWeatherResponseSchema } from "@weather-app/schemas/weather";
import { headers } from "next/headers";

import {
  type CurrentWeather,
  type FavouriteItem,
  type FavouriteWithWeather,
  parseCacheHeader,
  type WeatherCacheStatus,
} from "@/lib/api";

export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const incoming = await headers();
  const forwarded: Record<string, string> = {};
  const cookie = incoming.get("cookie");
  if (cookie) {
    forwarded.cookie = cookie;
  }
  // Without this the Fastify rate limit (per client IP, trustProxy on) would
  // count every user's requests against the Next server's own IP.
  const clientIp = incoming.get("x-forwarded-for");
  if (clientIp) {
    forwarded["x-forwarded-for"] = clientIp;
  }
  return fetch(`${env.INTERNAL_SERVER_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...forwarded, ...init?.headers },
  });
}

/** The session user, resolved from the request cookie. Null when signed out. */
export async function getServerSession(): Promise<{ userId: string } | null> {
  try {
    const response = await serverFetch("/api/auth/get-session");
    if (!response.ok) {
      return null;
    }
    // Better-Auth returns `{ session, user }` or JSON `null` when signed out.
    const body = (await response.json()) as { user?: { id?: unknown } } | null;
    return typeof body?.user?.id === "string" ? { userId: body.user.id } : null;
  } catch {
    return null;
  }
}

/** The signed-in user's favourites in display order; [] when the API is unreachable. */
export async function getFavouritesServer(): Promise<FavouriteItem[]> {
  try {
    const response = await serverFetch("/api/v1/favourites");
    if (!response.ok) {
      return [];
    }
    return favouritesListResponseSchema.parse(await response.json());
  } catch {
    return [];
  }
}

/** Favourites joined with their current conditions (null current on lookup failure). */
export async function getFavouritesWithWeather(): Promise<FavouriteWithWeather[]> {
  const favourites = await getFavouritesServer();
  return Promise.all(
    favourites.map(async (favourite) => {
      const weather = await getCurrentWeatherByCoords(favourite.lat, favourite.lon);
      return { ...favourite, current: null, ...weather };
    }),
  );
}

/**
 * Current conditions for stored coordinates. Null on any failure — a broken
 * weather lookup must degrade the card, never the page.
 */
export async function getCurrentWeatherByCoords(
  lat: number,
  lon: number,
): Promise<{ current: CurrentWeather; cache?: WeatherCacheStatus } | null> {
  try {
    const response = await serverFetch(`/api/v1/weather/current?lat=${lat}&lon=${lon}`);
    if (!response.ok) {
      return null;
    }
    const body = currentWeatherResponseSchema.parse(await response.json());
    const cache = parseCacheHeader(response.headers.get("x-cache"));
    return cache === undefined ? { current: body.current } : { current: body.current, cache };
  } catch {
    return null;
  }
}
