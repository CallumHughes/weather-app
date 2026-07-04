import { z } from "zod";

import { resolvedLocationSchema } from "@/modules/weather/weather.schemas";

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
      "Manual sort position. Null until the user reorders (not supported yet): " +
        "ordered favourites list first, unordered ones follow oldest-first.",
    ),
  createdAt: z.iso.datetime().describe("When the favourite was saved (ISO 8601, UTC)"),
});

export type FavouriteItem = z.infer<typeof favouriteItemSchema>;

export const favouritesListResponseSchema = z.array(favouriteItemSchema);

/** Route params for DELETE /api/v1/favourites/:id */
export const favouriteDeleteParamsSchema = z.object({
  id: z.string().min(1).describe("Favourite id (from GET /api/v1/favourites)"),
});
