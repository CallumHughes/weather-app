import { env } from "@weather-app/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? (env.INTERNAL_SERVER_URL ?? env.NEXT_PUBLIC_SERVER_URL)
      : env.NEXT_PUBLIC_SERVER_URL,
});
