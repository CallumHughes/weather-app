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
import { useFavourites } from "@/hooks/use-favourites";
import { favouriteLayoutId } from "@/providers/favourites-provider";
import { FavouriteCard } from "./favourite-card";

export interface FavouritesBoardProps {
  isSignedIn: boolean;
}

/**
 * The favourites list with self-managed drag reordering: mousedown on a
 * card's grip handle starts a drag, hovering another card splices the dragged
 * card into its position (insertion, not swap), and mouseup commits the new
 * order via reorderFavourites. Mouse-only by design — touch reordering is a
 * follow-up.
 */
export function FavouritesBoard({ isSignedIn }: FavouritesBoardProps) {
  const { favourites, removeFavourite, reorderFavourites } = useFavourites();
  // Working copy of the list so hover-reordering stays local until mouseup.
  const [items, setItems] = useState(favourites);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Sync from context (adjust-state-during-render) except mid-drag, where the
  // local order is ahead of the optimistic list and must not be clobbered.
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
        reorderFavourites(items.map((item) => item.id));
      } else {
        // Nothing moved: pick up any updates skipped during the drag.
        setItems(favourites);
      }
    }
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, [draggingId, items, favourites, reorderFavourites]);

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

  // No dragging while an optimistic add is pending: the reorder payload is
  // the complete id list, and a temporary `optimistic:` id in it would make
  // the server reject the whole set as out-of-sync. Handles return once the
  // add settles and the real row (with its real id) replaces the pending one.
  const canDrag = items.length > 1 && items.every((item) => !item.pending);

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
              onRemove={removeFavourite}
              onDragStart={canDrag ? setDraggingId : undefined}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
