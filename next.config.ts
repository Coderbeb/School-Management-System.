import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep puppeteer as external — it needs Chromium binary access
  serverExternalPackages: ["puppeteer"],
};

export default nextConfig;