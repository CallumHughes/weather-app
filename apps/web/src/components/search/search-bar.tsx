"use client";

import { Button } from "@weather-app/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@weather-app/ui/components/input-group";
import { Search } from "lucide-react";
import { useState } from "react";

import { useSearch } from "@/hooks/use-search";

/** The search bar only — results render in the result dialog. */
export function SearchBar() {
  // Every submit — even of an unchanged term — goes through submitSearch so
  // re-searching the same city re-opens the result dialog.
  const { search, submitSearch } = useSearch();
  const [input, setInput] = useState(search);
  // Sync the input field when something else (the history panel) sets the
  // search — the "adjust state during render" pattern, no effect needed.
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setInput(search);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = input.trim();
    if (next) {
      submitSearch(next);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id="weather-location"
          name="location"
          type="text"
          aria-label="City"
          placeholder="Search for a city…"
          autoComplete="off"
          maxLength={100}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </InputGroup>
      <Button type="submit">Search</Button>
    </form>
  );
}
