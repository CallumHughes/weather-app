import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Base URL of the API/auth server, read at runtime. Used for server-side
    // (SSR/RSC) auth calls and the /api reverse proxy (apps/web/next.config.ts).
    // Browser requests go same-origin through that proxy, so no public server
    // URL is needed.
    INTERNAL_SERVER_URL: z.url(),
  },
  runtimeEnv: {
    INTERNAL_SERVER_URL: process.env.INTERNAL_SERVER_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
