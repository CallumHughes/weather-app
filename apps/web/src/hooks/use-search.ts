"use client";

import { useContext } from "react";

import { SearchContext, type SearchContextValue } from "@/providers/search-provider";

/** The shared submitted-search state. Must be used within a SearchProvider. */
export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext);
  if (context === null) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}
