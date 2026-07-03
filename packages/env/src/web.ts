import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_SERVER_URL: z.url(),
  },
  server: {
    // Used only for server-side (RSC) requests to the auth server. Unlike
    // NEXT_PUBLIC_SERVER_URL, this is read at runtime rather than inlined at
    // build time
    INTERNAL_SERVER_URL: z.url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    INTERNAL_SERVER_URL: process.env.INTERNAL_SERVER_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
