import { WeatherHome } from "@/components/weather/weather-home";
import type { FavouriteWithWeather } from "@/lib/api";
import { getCurrentWeatherByCoords, getFavouritesServer, getServerSession } from "@/lib/server/api";

export default async function Home() {
  const session = await getServerSession();
  const favourites = session ? await getFavouritesServer() : [];
  const withWeather: FavouriteWithWeather[] = await Promise.all(
    favourites.map(async (favourite) => {
      const weather = await getCurrentWeatherByCoords(favourite.lat, favourite.lon);
      return { ...favourite, current: null, ...weather };
    }),
  );

  return (
    <main className="container mx-auto w-full max-w-xl px-4 py-8 lg:max-w-4xl">
      <WeatherHome isSignedIn={Boolean(session)} favourites={withWeather} />
    </main>
  );
}
