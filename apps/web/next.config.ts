import path from "node:path";

import "@weather-app/env/web";
import type { NextConfig } from "next";

const internalServerUrl = process.env.INTERNAL_SERVER_URL;

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  images: {
    // OpenWeather condition icons (weather-card.tsx), served through the
    // Next image optimizer so the browser never fetches from the provider.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "openweathermap.org",
        pathname: "/img/wn/**",
      },
    ],
  },
  async headers() {
    // Minimal hardening header set. A strict CSP is deliberately out of
    // scope (Next's inline runtime makes it a project of its own).
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    if (!internalServerUrl) return [];
    // forward the server API through the web app's own
    // origin (first-party cookies for auth, same-origin for everything else)
    return [
      {
        source: "/api/:path*",
        destination: `${internalServerUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
