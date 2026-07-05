import { Suspense } from "react";
import { FavouritesBoardSkeleton } from "@/components/favourites/favourites-board-skeleton";
import { FavouritesSection } from "@/components/favourites/favourites-section";
import { SearchHistory } from "@/components/history/search-history";
import { SearchBar } from "@/components/search/search-bar";
import { getServerSession } from "@/lib/server/api";
import { SearchProvider } from "@/providers/search-provider";

/**
 * Server-owned composition of the home page. Only the session gates the
 * shell; the favourites (and their weather lookups) stream in behind the
 * Suspense boundary so the search bar is interactive immediately. Page state
 * lives in the client providers, which receive server-rendered children.
 */
export default async function Home() {
  const session = await getServerSession();
  const isSignedIn = Boolean(session);

  return (
    <main className="container mx-auto w-full max-w-xl px-4 py-8 lg:max-w-4xl">
      <SearchProvider>
        <div className="flex flex-col gap-6">
          <SearchBar />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Suspense fallback={<FavouritesBoardSkeleton />}>
              <FavouritesSection isSignedIn={isSignedIn} />
            </Suspense>
            <div className="flex flex-col gap-6">
              <SearchHistory isSignedIn={isSignedIn} />
            </div>
          </div>
        </div>
      </SearchProvider>
    </main>
  );
}
