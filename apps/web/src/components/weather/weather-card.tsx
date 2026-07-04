import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weather-app/ui/components/card";

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

/** Presentational: renders the weather DTO, does no fetching. */
export function WeatherCard({ weather }: { weather: WeatherResponse }) {
  const { location, current } = weather;
  const place = [location.name, location.state, location.country].filter(Boolean).join(", ");

  return (
    <Card data-testid="weather-card">
      <CardHeader>
        <CardTitle>{place}</CardTitle>
        <CardDescription>Observed at {formatObservedAt(current.observedAt)}</CardDescription>
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
