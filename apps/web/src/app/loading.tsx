import { Skeleton } from "@weather-app/ui/components/skeleton";

/** Home-page fallback while the RSC fetches session, favourites and weather. */
export default function Loading() {
  return (
    <main className="container mx-auto w-full max-w-xl px-4 py-8 lg:max-w-4xl">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-full" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="hidden h-32 lg:block" />
        </div>
      </div>
    </main>
  );
}
