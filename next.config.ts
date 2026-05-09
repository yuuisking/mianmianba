import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["undici"],
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
    webpackMemoryOptimizations: true,
    serverSourceMaps: false,
    preloadEntriesOnStart: false,
  },
  webpack: (config, { dev }) => {
    if (!dev && config.cache) {
      config.cache = {
        type: "memory",
      };
    }

    return config;
  },
};

export default nextConfig;
