"use client";

import { Button } from "@weather-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@weather-app/ui/components/card";
import { Skeleton } from "@weather-app/ui/components/skeleton";
import { Star, Trash2 } from "lucide-react";

import { useFavourites, useRemoveFavourite } from "@/hooks/use-favourites";
import type { FavouriteItem } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

function locationLabel(item: FavouriteItem): string {
  return [item.name, item.state, item.country].filter(Boolean).join(", ");
}

export interface FavouritesProps {
  /** Re-run a search for a favourite (sets the lifted search state). */
  onSelect: (location: string) => void;
}

export function Favourites({ onSelect }: FavouritesProps) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isSignedIn = Boolean(session);
  const favourites = useFavourites(isSignedIn);
  const removeFavourite = useRemoveFavourite();

  // Signed out: nothing at all (no panel, no fetch) — the history panel's
  // sign-in hint already covers the signed-out story.
  if (isSessionPending || !isSignedIn) {
    return null;
  }

  let content: React.ReactNode;
  if (favourites.isPending) {
    content = (
      <div className="flex flex-col gap-2" data-testid="favourites-loading">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  } else if (favourites.isError) {
    content = (
      <div className="flex flex-col items-start gap-2" data-testid="favourites-error">
        <p className="text-muted-foreground text-sm">Couldn’t load your favourites.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => favourites.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (favourites.data.length === 0) {
    content = (
      <p className="text-muted-foreground text-sm" data-testid="favourites-empty">
        Star a location to save it here.
      </p>
    );
  } else {
    content = (
      <ul className="flex flex-col" data-testid="favourites-list">
        {favourites.data.map((item) => (
          <li key={item.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(item.name)}
              className="flex min-w-0 flex-1 items-baseline py-2 text-left text-sm hover:text-foreground"
            >
              <span className="truncate">{locationLabel(item)}</span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${item.name} from favourites`}
              disabled={removeFavourite.isPending}
              onClick={() => removeFavourite.mutate(item.id)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card data-testid="favourites">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star aria-hidden="true" className="size-4" />
          Favourites
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
