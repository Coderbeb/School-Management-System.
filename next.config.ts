import type { NextConfig } from "next";

const buildId = Date.now().toString();

const nextConfig: NextConfig = {
  generateBuildId: () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  // Keep puppeteer as external — it needs Chromium binary access
  serverExternalPackages: ["puppeteer"],
  experimental: {
    // This is the correct way to allow origins for Server Actions
    serverActions: {
      allowedOrigins: ["192.168.1.41:3000", "localhost:3000","10.88.86.215:3000"],
    },
  },
};

export default nextConfig;