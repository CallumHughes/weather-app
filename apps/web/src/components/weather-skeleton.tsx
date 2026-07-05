import { Card, CardContent, CardHeader } from "@weather-app/ui/components/card";
import { Skeleton } from "@weather-app/ui/components/skeleton";

/** Loading placeholder mirroring the weather card layout. */
export function WeatherSkeleton() {
  return (
    <Card data-testid="weather-skeleton" aria-hidden="true">
      <CardHeader>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="h-[4.5rem] rounded-lg" />
          <Skeleton className="h-[4.5rem] rounded-lg" />
          <Skeleton className="h-[4.5rem] rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}
