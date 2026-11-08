import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/apps", destination: "/", permanent: true },
      { source: "/apps/mcpdeck", destination: "/", permanent: true },
      { source: "/apps/mcpdeck/generate", destination: "/generate", permanent: true },
      { source: "/mcpdeck", destination: "/", permanent: true },
      { source: "/mcpdeck/generate", destination: "/generate", permanent: true },
    ];
  },
};

export default nextConfig;
