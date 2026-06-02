import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    // McpDeck's page moved under /apps. Keep the old top-level URLs working.
    // (The API namespace /api/mcpdeck/* is unaffected — these are page paths only.)
    return [
      { source: "/mcpdeck", destination: "/apps/mcpdeck", permanent: true },
      { source: "/mcpdeck/generate", destination: "/apps/mcpdeck/generate", permanent: true },
    ];
  },
};

export default nextConfig;
