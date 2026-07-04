import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async rewrites() {
    // Forward the public API surface through this origin so the interactive
    // playground works same-origin (the API's CORS only allows the web app).
    // Scoped to /api/v1 + /health on purpose: /api/search is this app's own
    // search route, and the docs have no business proxying /api/auth.
    const internalServerUrl = process.env.INTERNAL_SERVER_URL;
    if (!internalServerUrl) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${internalServerUrl}/api/v1/:path*`,
      },
      {
        source: "/health",
        destination: `${internalServerUrl}/health`,
      },
    ];
  },
};

export default withMDX(config);
