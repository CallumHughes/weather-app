import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Only run source tests — `tsc -b` (check-types) also emits compiled
    // copies of the test files into dist/.
    include: ["src/**/*.test.ts"],
    // Hermetic env: tests must never depend on (or leak) real credentials
    // from apps/server/.env. These take precedence over dotenv.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:password@localhost:5432/weather-app-test",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      BETTER_AUTH_URL: "http://localhost:3000",
      CORS_ORIGIN: "http://localhost:3001",
      OPENWEATHER_API_KEY: "test-api-key",
    },
  },
});
