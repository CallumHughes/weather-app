import { env } from "@weather-app/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // In the browser, talk to the web app's own origin (undefined -> current
  // origin). Requests to /api are rewritten to the server internally
  // (see next.config.ts), keeping the session cookie first-party.
  // On the server (SSR/RSC), call the server directly over the private network.
  baseURL: typeof window === "undefined" ? env.INTERNAL_SERVER_URL : undefined,
});
