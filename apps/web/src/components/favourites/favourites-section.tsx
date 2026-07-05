import { getFavouritesWithWeather } from "@/lib/server/api";
import { FavouritesProvider } from "@/providers/favourites-provider";
import { SearchResultDialog } from "../search/search-result-dialog";
import { FavouritesBoard } from "./favourites-board";

export interface FavouritesSectionProps {
  isSignedIn: boolean;
}

/**
 * Async server component streamed behind the page's Suspense boundary: joins
 * favourites with their weather, then mounts the provider around exactly the
 * components that consume it — the board and the result dialog. The dialog
 * renders through a portal (no inline DOM), so the board stays the boundary's
 * only grid item; the dialog opens as soon as this section streams in if a
 * search was submitted meanwhile.
 */
export async function FavouritesSection({ isSignedIn }: FavouritesSectionProps) {
  // Signed out there is nothing to fetch — resolve instantly, no fallback flash.
  const favourites = isSignedIn ? await getFavouritesWithWeather() : [];

  return (
    <FavouritesProvider favourites={favourites}>
      <FavouritesBoard isSignedIn={isSignedIn} />
      <SearchResultDialog isSignedIn={isSignedIn} />
    </FavouritesProvider>
  );
}
