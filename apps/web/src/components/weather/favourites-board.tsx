"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@weather-app/ui/components/empty";
import { cn } from "@weather-app/ui/lib/utils";
import { produce } from "immer";
import { Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import type { FavouriteWithWeather } from "@/lib/api";

import { FavouriteCard } from "./favourite-card";

/** A favourite as held in optimistic state: pending until the action lands. */
export type OptimisticFavourite = FavouriteWithWeather & { pending?: boolean };

/**
 * Shared-element id linking a location across surfaces (search dialog →
 * board). Keyed by coordinates — the favourite's identity — rather than the
 * row id, which changes when the optimistic row is replaced by the real one.
 */
export function favouriteLayoutId(lat: number, lon: number): string {
  return `favourite:${lat}:${lon}`;
}

export interface FavouritesBoardProps {
  favourites: OptimisticFavourite[];
  isSignedIn: boolean;
  onRemove: (id: string) => void;
  /** Fired on drag end with the complete id list in the new display order. */
  onReorder: (ids: string[]) => void;
}

/**
 * The favourites list with self-managed drag reordering: mousedown on a
 * card's grip handle starts a drag, hovering another card splices the dragged
 * card into its position (insertion, not swap), and mouseup commits the new
 * order via onReorder. Mouse-only by design — touch reordering is a follow-up.
 */
export function FavouritesBoard({
  favourites,
  isSignedIn,
  onRemove,
  onReorder,
}: FavouritesBoardProps) {
  // Working copy of the list so hover-reordering stays local until mouseup.
  const [items, setItems] = useState(favourites);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Sync from props (adjust-state-during-render) except mid-drag, where the
  // local order is ahead of the optimistic props and must not be clobbered.
  const [prevFavourites, setPrevFavourites] = useState(favourites);
  if (favourites !== prevFavourites) {
    setPrevFavourites(favourites);
    if (draggingId === null) {
      setItems(favourites);
    }
  }

  // The drag can end anywhere on the page, so the listener lives on window.
  useEffect(() => {
    if (draggingId === null) {
      return;
    }
    function endDrag() {
      setDraggingId(null);
      const orderChanged =
        items.length !== favourites.length ||
        items.some((item, index) => item.id !== favourites[index]?.id);
      if (orderChanged) {
        onReorder(items.map((item) => item.id));
      } else {
        // Nothing moved: pick up any prop updates skipped during the drag.
        setItems(favourites);
      }
    }
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, [draggingId, items, favourites, onReorder]);

  function handleHoverOverCard(overIndex: number) {
    if (draggingId === null) {
      return;
    }
    const fromIndex = items.findIndex((item) => item.id === draggingId);
    if (fromIndex === -1 || fromIndex === overIndex) {
      return;
    }
    setItems(
      produce(items, (draft) => {
        const [dragged] = draft.splice(fromIndex, 1);
        if (dragged) {
          draft.splice(overIndex, 0, dragged);
        }
      }),
    );
  }

  if (items.length === 0) {
    return (
      <Empty className="border border-dashed" data-testid="favourites-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Star aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No favourites yet</EmptyTitle>
          <EmptyDescription>
            {isSignedIn
              ? "Search for a city and add it to your favourites."
              : "Search for a city, then sign in to save it here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const canDrag = items.length > 1;

  return (
    <div
      data-testid="favourites-board"
      className={cn("flex flex-col gap-4", draggingId !== null && "select-none")}
    >
      <AnimatePresence initial={false}>
        {items.map((favourite, index) => (
          <motion.div
            // Keyed by coordinates so the optimistic row and the real row it
            // becomes are the same element (no remount when the id changes).
            key={favouriteLayoutId(favourite.lat, favourite.lon)}
            layout
            layoutId={favouriteLayoutId(favourite.lat, favourite.lon)}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onMouseEnter={() => handleHoverOverCard(index)}
            className={cn(
              favourite.id === draggingId && "opacity-50",
              favourite.pending && "pointer-events-none opacity-60",
            )}
          >
            <FavouriteCard
              favourite={favourite}
              onRemove={onRemove}
              onDragStart={canDrag ? setDraggingId : undefined}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
