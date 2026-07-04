import { z } from "zod";

/** A single search-history entry as returned by GET /api/v1/history. */
export const historyItemSchema = z.object({
  id: z.string(),
  query: z.string(),
  resolvedName: z.string(),
  country: z.string(),
  state: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  createdAt: z.iso.datetime(),
});

export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyListResponseSchema = z.array(historyItemSchema);

/** Route params for DELETE /api/v1/history/:id */
export const historyDeleteParamsSchema = z.object({
  id: z.string().min(1),
});
