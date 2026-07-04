import { z } from "zod";

/** Query params for GET /api/v1/weather */
export const weatherQuerySchema = z.object({
  location: z
    .string()
    .trim()
    .min(1, "location must not be empty")
    .max(100, "location must be at most 100 characters"),
});

export type WeatherQuery = z.infer<typeof weatherQuerySchema>;

/** Response DTO — the only shape the client ever sees. */
export const weatherResponseSchema = z.object({
  location: z.object({
    name: z.string(),
    country: z.string(),
    state: z.string().optional(),
    lat: z.number(),
    lon: z.number(),
  }),
  current: z.object({
    temperatureC: z.number(),
    feelsLikeC: z.number(),
    humidityPct: z.number(),
    windSpeedMs: z.number(),
    condition: z.object({
      id: z.number(),
      main: z.string(),
      description: z.string(),
      icon: z.string(),
    }),
    observedAt: z.iso.datetime(),
  }),
});

export type WeatherResponse = z.infer<typeof weatherResponseSchema>;

/** Consistent error envelope for every non-2xx response. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
