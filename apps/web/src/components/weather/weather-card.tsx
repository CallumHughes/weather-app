import { Button } from "@weather-app/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weather-app/ui/components/card";
import { Droplets, MapPin, Star, Thermometer, Wind } from "lucide-react";

import type { WeatherResult } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

import { conditionIcon } from "./condition-icon";

/** Star-toggle state and callback, provided by the container when signed in. */
export interface WeatherCardFavourite {
  isFavourite: boolean;
  /** Disables the toggle while an add/remove mutation is in flight. */
  isPending: boolean;
  onToggle: () => void;
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 font-medium text-lg tabular-nums">{value}</dd>
    </div>
  );
}

/** Presentational: renders the weather DTO, does no fetching. */
export function WeatherCard({
  weather,
  favourite,
}: {
  weather: WeatherResult;
  /** Omitted when signed out — the star is not rendered at all. */
  favourite?: WeatherCardFavourite;
}) {
  const { location, current, cache } = weather;
  const place = [location.name, location.state, location.country].filter(Boolean).join(", ");
  // HIT/STALE means the server answered from its weather cache; MISS (or a
  // missing header) means a fresh upstream fetch — nothing worth flagging.
  const isCached = cache === "HIT" || cache === "STALE";
  const ConditionIcon = conditionIcon(current.condition.main);

  return (
    <Card data-testid="weather-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {place}
        </CardTitle>
        <CardDescription>
          Updated {formatRelativeTime(current.observedAt)}
          {isCached && " · cached"}
        </CardDescription>
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
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <ConditionIcon aria-hidden="true" className="size-11 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium text-4xl tabular-nums leading-none">
              {Math.round(current.temperatureC)}°C
            </p>
            <p className="mt-1.5 text-muted-foreground text-sm">
              <span className="capitalize">{current.condition.description}</span>
              {` · feels like ${Math.round(current.feelsLikeC)}°`}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={Wind} label="Wind" value={`${current.windSpeedMs} m/s`} />
          <StatTile icon={Droplets} label="Humidity" value={`${current.humidityPct}%`} />
          <StatTile
            icon={Thermometer}
            label="Feels like"
            value={`${Math.round(current.feelsLikeC)}°C`}
          />
        </dl>
      </CardContent>
    </Card>
  );
}
