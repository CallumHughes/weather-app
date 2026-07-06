import { z } from "zod";

import { resolvedLocationSchema } from "./weather";

/**
 * Body for POST /api/v1/favourites — exactly the resolved location from the
 * weather DTO (`location` on GET /api/v1/weather). The field schemas are
 * shared with the weather module so the two can never drift: coordinates are
 * the favourite's identity and must round-trip unchanged.
 */
export const favouriteCreateSchema = resolvedLocationSchema;

export type FavouriteCreate = z.infer<typeof favouriteCreateSchema>;

/** A favourite location as returned by GET /api/v1/favourites. */
export const favouriteItemSchema = z.object({
  id: z.string().describe("Favourite id — pass to DELETE /api/v1/favourites/{id}"),
  ...resolvedLocationSchema.shape,
  sortOrder: z
    .number()
    .int()
    .nullable()
    .describe(
      "Sort position: new favourites are created above existing ones and " +
        "PUT /api/v1/favourites/order rewrites positions. Ordered favourites list " +
        "first; legacy null rows follow oldest-first.",
    ),
  createdAt: z.iso.datetime().describe("When the favourite was saved (ISO 8601, UTC)"),
});

export type FavouriteItem = z.infer<typeof favouriteItemSchema>;

export const favouritesListResponseSchema = z.array(favouriteItemSchema);

/** Route params for DELETE /api/v1/favourites/:id */
export const favouriteDeleteParamsSchema = z.object({
  id: z.string().min(1).describe("Favourite id (from GET /api/v1/favourites)"),
});

/**
 * Body for PUT /api/v1/favourites/order — the complete ordered id list, top
 * first. The max mirrors the per-user favourites cap.
 */
export const favouritesReorderSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, "ids must not be empty")
    .max(20, "ids must have at most 20 entries")
    .refine((ids) => new Set(ids).size === ids.length, "ids must be unique")
    .describe(
      "Every favourite id the user currently has, in the desired display order (top first).",
    ),
});

export type FavouritesReorder = z.infer<typeof favouritesReorderSchema>;
