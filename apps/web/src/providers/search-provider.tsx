"use client";

import { createContext, useState } from "react";

export interface SearchContextValue {
  /** The submitted search term ("" until the first submit). */
  search: string;
  /** Whether the search result dialog is open. */
  dialogOpen: boolean;
  /** Submit a search: sets the term and (re)opens the result dialog. */
  submitSearch: (term: string) => void;
  setDialogOpen: (open: boolean) => void;
}

/** Consumed via useSearch (hooks/use-search.ts). */
export const SearchContext = createContext<SearchContextValue | null>(null);

/**
 * Owns the submitted search: the search bar and the history panel drive it,
 * the result dialog reads it. A client boundary that renders server-owned
 * children, so the page layout stays a server component.
 */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  function submitSearch(term: string) {
    setSearch(term);
    setDialogOpen(true);
  }

  return (
    <SearchContext.Provider value={{ search, dialogOpen, submitSearch, setDialogOpen }}>
      {children}
    </SearchContext.Provider>
  );
}
