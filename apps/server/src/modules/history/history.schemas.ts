// The history contract (params and response DTOs) lives in
// @weather-app/schemas so the web app derives its types — and validates
// responses — from the exact schemas these routes serialize with. Re-exported
// here as the module-local home of the history schemas.
export {
  type HistoryItem,
  historyDeleteParamsSchema,
  historyItemSchema,
  historyListResponseSchema,
} from "@weather-app/schemas/history";
