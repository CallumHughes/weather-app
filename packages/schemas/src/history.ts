import { z } from "zod";

/** A single search-history entry as returned by GET /api/v1/history. */
export const historyItemSchema = z.object({
  id: z.string().describe("Entry id — pass to DELETE /api/v1/history/{id}"),
  query: z.string().describe("The free-text location the user searched for"),
  resolvedName: z.string().describe("Place name the query resolved to"),
  country: z.string().describe("ISO 3166 country code, e.g. GB"),
  state: z.string().optional().describe("State/region, when the geocoder provides one"),
  lat: z.number(),
  lon: z.number(),
  createdAt: z.iso.datetime().describe("When the search was last made (ISO 8601, UTC)"),
});

export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyListResponseSchema = z.array(historyItemSchema);

/** Route params for DELETE /api/v1/history/:id */
export const historyDeleteParamsSchema = z.object({
  id: z.string().min(1).describe("History entry id (from GET /api/v1/history)"),
});
