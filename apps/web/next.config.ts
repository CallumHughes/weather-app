import path from "node:path";

import "@weather-app/env/web";
import type { NextConfig } from "next";

const internalServerUrl = process.env.INTERNAL_SERVER_URL;

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
