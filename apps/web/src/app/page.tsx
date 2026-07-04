import { WeatherHome } from "@/components/weather/weather-home";

export default function Home() {
  return (
    <main className="container mx-auto w-full max-w-xl px-4 py-8 lg:max-w-4xl">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-medium text-2xl tracking-tight">Weather</h1>
          <p className="text-muted-foreground text-sm">
            Search for a city to see the current conditions.
          </p>
        </div>
        <WeatherHome />
      </div>
    </main>
  );
}
