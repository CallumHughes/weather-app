import { Button } from "@weather-app/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weather-app/ui/components/card";
import { Star } from "lucide-react";

import type { WeatherResponse } from "@/lib/api";

function formatObservedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

/** Star-toggle state and callback, provided by the container when signed in. */
export interface WeatherCardFavourite {
  isFavourite: boolean;
  /** Disables the toggle while an add/remove mutation is in flight. */
  isPending: boolean;
  onToggle: () => void;
}

/** Presentational: renders the weather DTO, does no fetching. */
export function WeatherCard({
  weather,
  favourite,
}: {
  weather: WeatherResponse;
  /** Omitted when signed out — the star is not rendered at all. */
  favourite?: WeatherCardFavourite;
}) {
  const { location, current } = weather;
  const place = [location.name, location.state, location.country].filter(Boolean).join(", ");

  return (
    <Card data-testid="weather-card">
      <CardHeader>
        <CardTitle>{place}</CardTitle>
        <CardDescription>Observed at {formatObservedAt(current.observedAt)}</CardDescription>
        {favourite && (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-pressed={favourite.isFavourite}
              aria-label={
                favourite.isFavourite
                  ? `Remove ${location.name} from favourites`
                  : `Add ${location.name} to favourites`
              }
              disabled={favourite.isPending}
              onClick={favourite.onToggle}
            >
              <Star
                aria-hidden="true"
                className={favourite.isFavourite ? "fill-current" : undefined}
              />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {/* biome-ignore lint/performance/noImgElement: tiny external icon; next/image optimization adds a proxy hop for no benefit */}
          <img
            src={`https://openweathermap.org/img/wn/${current.condition.icon}@2x.png`}
            alt={current.condition.description}
            width={80}
            height={80}
            className="-m-2 size-20"
          />
          <div>
            <p className="font-medium text-4xl tabular-nums">
              {Math.round(current.temperatureC)}°C
            </p>
            <p className="text-muted-foreground capitalize">{current.condition.description}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t pt-4">
          <div>
            <dt className="text-muted-foreground">Feels like</dt>
            <dd className="font-medium tabular-nums">{Math.round(current.feelsLikeC)}°C</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Humidity</dt>
            <dd className="font-medium tabular-nums">{current.humidityPct}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Wind</dt>
            <dd className="font-medium tabular-nums">{current.windSpeedMs} m/s</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
