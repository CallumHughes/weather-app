/**
 * Server-side fetch helpers for RSCs and server actions. Unlike lib/api.ts
 * (browser, same-origin via the BFF rewrite), these call the Fastify server
 * directly over the private network and must forward the caller's cookie
 * (session) and client IP (per-user rate limiting) themselves.
 */

import { env } from "@weather-app/env/web";
import { headers } from "next/headers";

import type { CurrentWeather, FavouriteItem, WeatherCacheStatus } from "@/lib/api";

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
    return (await response.json()) as FavouriteItem[];
  } catch {
    return [];
  }
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
    const body = (await response.json()) as { current: CurrentWeather };
    const cacheHeader = response.headers.get("x-cache");
    const cache =
      cacheHeader === "HIT" || cacheHeader === "MISS" || cacheHeader === "STALE"
        ? cacheHeader
        : undefined;
    return cache === undefined ? { current: body.current } : { current: body.current, cache };
  } catch {
    return null;
  }
}
