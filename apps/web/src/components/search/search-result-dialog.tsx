"use client";

import { Alert, AlertDescription, AlertTitle } from "@weather-app/ui/components/alert";
import { Button } from "@weather-app/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@weather-app/ui/components/dialog";
import { CloudOff, MapPinOff, RefreshCw } from "lucide-react";
import { motion } from "motion/react";

import { AuthDrawer } from "@/components/auth/auth-drawer";
import { useFavourites } from "@/hooks/use-favourites";
import { useSearch } from "@/hooks/use-search";
import { useWeather } from "@/hooks/use-weather";
import { ApiError, type WeatherResult } from "@/lib/api";
import { favouriteLayoutId } from "@/providers/favourites-provider";
import { WeatherCard } from "../weather-card";
import { WeatherSkeleton } from "../weather-skeleton";

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "LOCATION_NOT_FOUND" || error.status === 404);
}

export interface SearchResultDialogProps {
  isSignedIn: boolean;
}

/**
 * The search result in a centred dialog (all screen sizes): loading skeleton,
 * not-found/error states, then the weather card with Cancel (left) and
 * Add / Sign in to save (right). Owns the weather query for the submitted
 * search; Add closes the dialog and hands the result to the favourites.
 */
export function SearchResultDialog({ isSignedIn }: SearchResultDialogProps) {
  const { search, dialogOpen, setDialogOpen } = useSearch();
  const { isSaved, addFavourite } = useFavourites();
  const query = useWeather(search, { isSignedIn });

  function handleAdd(weather: WeatherResult) {
    setDialogOpen(false);
    addFavourite(weather);
  }

  let body: React.ReactNode;
  if (query.isFetching) {
    body = <WeatherSkeleton />;
  } else if (query.isError && isNotFound(query.error)) {
    // Not found: a normal outcome — warning-toned, not destructive. The theme
    // has no warning token, so amber utilities are the agreed exception.
    body = (
      <Alert
        data-testid="weather-not-found"
        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      >
        <MapPinOff aria-hidden="true" />
        <AlertTitle>Couldn’t find “{search}”</AlertTitle>
        <AlertDescription className="text-amber-700/90 dark:text-amber-400/90">
          Check the spelling or try a nearby city.
        </AlertDescription>
      </Alert>
    );
  } else if (query.isError) {
    // Error: network / validation / upstream failure, with a working Retry.
    body = (
      <div data-testid="weather-error" className="flex flex-col items-start gap-3">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CloudOff aria-hidden="true" />
          <AlertTitle>Weather service unavailable</AlertTitle>
          <AlertDescription>Couldn’t reach the forecast provider.</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  } else if (query.isSuccess) {
    const { lat, lon } = query.data.location;
    // Share a layout id with the board card only when Add is possible: the
    // card then animates from the dialog to the top of the list on add.
    // (Skipped when already saved — two live elements must not share an id.)
    body =
      isSignedIn && !isSaved(lat, lon) ? (
        <motion.div layoutId={favouriteLayoutId(lat, lon)}>
          <WeatherCard weather={query.data} />
        </motion.div>
      ) : (
        <WeatherCard weather={query.data} />
      );
  } else {
    body = null;
  }

  let addButton: React.ReactNode;
  if (!isSignedIn) {
    addButton = <AuthDrawer trigger={<Button type="button">Sign in to save</Button>} />;
  } else if (query.isSuccess && isSaved(query.data.location.lat, query.data.location.lon)) {
    addButton = (
      <Button type="button" disabled>
        Saved
      </Button>
    );
  } else {
    addButton = (
      <Button
        type="button"
        disabled={!query.isSuccess}
        onClick={() => query.isSuccess && handleAdd(query.data)}
      >
        Add
      </Button>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent data-testid="search-result-dialog">
        <DialogHeader>
          <DialogTitle>Search result</DialogTitle>
          <DialogDescription>Current weather for “{search}”.</DialogDescription>
        </DialogHeader>
        <div aria-live="polite">{body}</div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          {addButton}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
