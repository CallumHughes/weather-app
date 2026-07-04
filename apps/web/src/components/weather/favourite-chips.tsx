"use client";

import { Badge } from "@weather-app/ui/components/badge";
import { Star } from "lucide-react";

import { useFavourites } from "@/hooks/use-favourites";
import { authClient } from "@/lib/auth-client";

export interface FavouriteChipsProps {
  /** Re-run a search for a favourite (sets the lifted search state). */
  onSelect: (location: string) => void;
}

/**
 * Mobile-only quick access to favourites: a horizontally scrollable chip row
 * under the search bar. Desktop uses the sidebar Favourites card instead
 * (this row is hidden at `lg`, the card below it). Signed out, or with no
 * favourites yet, it renders nothing — no fetch is triggered either (the
 * query is shared with the Favourites card and disabled while signed out).
 */
export function FavouriteChips({ onSelect }: FavouriteChipsProps) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isSignedIn = Boolean(session);
  const favourites = useFavourites(isSignedIn);

  if (isSessionPending || !isSignedIn || !favourites.data?.length) {
    return null;
  }

  return (
    <div data-testid="favourite-chips" className="-my-2 flex gap-2 overflow-x-auto py-2 lg:hidden">
      {favourites.data.map((item) => (
        <Badge
          key={item.id}
          variant="outline"
          className="h-6 shrink-0 rounded-full px-2.5"
          render={<button type="button" onClick={() => onSelect(item.name)} />}
        >
          <Star aria-hidden="true" />
          {item.name}
        </Badge>
      ))}
    </div>
  );
}
