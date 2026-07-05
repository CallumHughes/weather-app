"use server";

import { revalidatePath } from "next/cache";

import { type ApiErrorCode, type FavouriteLocationInput, parseErrorEnvelope } from "@/lib/api";
import { serverFetch } from "@/lib/server/api";

/**
 * Actions return plain result objects instead of throwing: Error instances
 * don't serialize across the server-action boundary, and the client needs the
 * code/message to toast and decide whether to resync.
 */
export type FavouriteActionResult =
  | { ok: true }
  | { ok: false; code: ApiErrorCode; message: string };

const OK: FavouriteActionResult = { ok: true };

async function failure(response: Response): Promise<FavouriteActionResult> {
  const error = await parseErrorEnvelope(response);
  return { ok: false, code: error.code, message: error.message };
}

export async function addFavouriteAction(
  location: FavouriteLocationInput,
): Promise<FavouriteActionResult> {
  const response = await serverFetch("/api/v1/favourites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location),
  });
  // Already a favourite means the optimistic add was stale, not wrong — the
  // revalidated list below is the reconciliation either way.
  if (!response.ok && response.status !== 409) {
    return failure(response);
  }
  revalidatePath("/");
  return OK;
}

export async function removeFavouriteAction(id: string): Promise<FavouriteActionResult> {
  const response = await serverFetch(`/api/v1/favourites/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  // 404 = already gone (another tab); the remove is effectively done.
  if (!response.ok && response.status !== 404) {
    return failure(response);
  }
  revalidatePath("/");
  return OK;
}

export async function reorderFavouritesAction(ids: string[]): Promise<FavouriteActionResult> {
  const response = await serverFetch("/api/v1/favourites/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (response.ok) {
    revalidatePath("/");
    return OK;
  }
  const result = await failure(response);
  // Out of sync: the list changed elsewhere. Revalidate anyway so the board
  // resyncs to the server's order while the caller surfaces the error.
  if (result.ok === false && result.code === "FAVOURITES_OUT_OF_SYNC") {
    revalidatePath("/");
  }
  return result;
}
