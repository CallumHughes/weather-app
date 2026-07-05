"use client";

import { Button } from "@weather-app/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weather-app/ui/components/card";
import { GripVertical, MapPin, Trash2 } from "lucide-react";
import type { OptimisticFavourite } from "@/providers/favourites-provider";
import { WeatherCard } from "../weather-card";

export interface FavouriteCardProps {
  favourite: OptimisticFavourite;
  onRemove: (id: string) => void;
  /** Omitted when dragging is unavailable (single favourite) — no handle rendered. */
  onDragStart?: (id: string) => void;
}

/** A favourite as a weather card, with drag handle + remove in the action slot. */
export function FavouriteCard({ favourite, onRemove, onDragStart }: FavouriteCardProps) {
  const action = (
    <div className="flex items-center">
      {onDragStart && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="cursor-grab active:cursor-grabbing"
          aria-label={`Reorder ${favourite.name}`}
          onMouseDown={(event) => {
            // Prevents text selection from hijacking the drag.
            event.preventDefault();
            onDragStart(favourite.id);
          }}
        >
          <GripVertical aria-hidden="true" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${favourite.name} from favourites`}
        disabled={favourite.pending}
        onClick={() => onRemove(favourite.id)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );

  if (favourite.current === null) {
    // The weather lookup failed server-side: keep the card (and its actions)
    // so the favourite can still be managed.
    const place = [favourite.name, favourite.state, favourite.country].filter(Boolean).join(", ");
    return (
      <Card data-testid="favourite-card-unavailable">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            {place}
          </CardTitle>
          <CardDescription>Weather unavailable</CardDescription>
          <CardAction>{action}</CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Couldn’t load current conditions. They’ll be back on the next refresh.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <WeatherCard
      weather={{
        location: {
          name: favourite.name,
          country: favourite.country,
          ...(favourite.state !== undefined && { state: favourite.state }),
          lat: favourite.lat,
          lon: favourite.lon,
        },
        current: favourite.current,
        ...(favourite.cache !== undefined && { cache: favourite.cache }),
      }}
      action={action}
    />
  );
}
