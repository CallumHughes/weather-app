// The favourites contract (request bodies, params and response DTOs) lives in
// @weather-app/schemas so the web app derives its types — and validates
// responses — from the exact schemas these routes serialize with. Re-exported
// here as the module-local home of the favourites schemas.
export {
  type FavouriteCreate,
  type FavouriteItem,
  type FavouritesReorder,
  favouriteCreateSchema,
  favouriteDeleteParamsSchema,
  favouriteItemSchema,
  favouritesListResponseSchema,
  favouritesReorderSchema,
} from "@weather-app/schemas/favourites";
