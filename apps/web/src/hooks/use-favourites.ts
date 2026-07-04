"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  addFavourite,
  deleteFavourite,
  type FavouriteLocationInput,
  getFavourites,
} from "@/lib/api";

export const FAVOURITES_QUERY_KEY = ["favourites"] as const;

/**
 * The signed-in user's favourite locations. Disabled while signed out so the
 * favourites UI never fires an unauthenticated request.
 */
export function useFavourites(isSignedIn: boolean) {
  return useQuery({
    queryKey: FAVOURITES_QUERY_KEY,
    queryFn: getFavourites,
    enabled: isSignedIn,
  });
}

/**
 * Save a favourite; refreshes the list on success. A 409 ALREADY_FAVOURITE is
 * treated as success: it only means our list was stale (e.g. favourited in
 * another tab) — invalidating brings the truth back either way.
 */
export function useAddFavourite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (location: FavouriteLocationInput) => {
      try {
        await addFavourite(location);
      } catch (error) {
        if (!(error instanceof ApiError && error.code === "ALREADY_FAVOURITE")) {
          throw error;
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FAVOURITES_QUERY_KEY }),
  });
}

/** Remove a favourite; refreshes the list on success. */
export function useRemoveFavourite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFavourite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FAVOURITES_QUERY_KEY }),
  });
}
