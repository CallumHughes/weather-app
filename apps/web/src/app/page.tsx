import { WeatherSearch } from "@/components/weather/weather-search";

export default function Home() {
  return (
    <main className="container mx-auto w-full max-w-xl px-4 py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-medium text-2xl tracking-tight">Weather</h1>
          <p className="text-muted-foreground text-sm">
            Search for a city to see the current conditions.
          </p>
        </div>
        <WeatherSearch />
      </div>
    </main>
  );
}
