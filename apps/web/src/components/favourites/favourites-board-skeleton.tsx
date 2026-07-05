import { WeatherSkeleton } from "../weather-skeleton";

/** Suspense fallback for the favourites board while it streams in. */
export function FavouritesBoardSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="favourites-board-skeleton">
      <WeatherSkeleton />
      <WeatherSkeleton />
    </div>
  );
}
