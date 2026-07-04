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
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-16" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t pt-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-10" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-10" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
