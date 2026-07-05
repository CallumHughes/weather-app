"use client";

import { useContext } from "react";

import { FavouritesContext, type FavouritesContextValue } from "@/providers/favourites-provider";

/** The optimistic favourites list and its mutations. Must be used within a FavouritesProvider. */
export function useFavourites(): FavouritesContextValue {
  const context = useContext(FavouritesContext);
  if (context === null) {
    throw new Error("useFavourites must be used within a FavouritesProvider");
  }
  return context;
}
