import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep puppeteer and razorpay as external — they need Node.js runtime
  serverExternalPackages: ["puppeteer", "razorpay"],
  // Skip TypeScript checking during build to avoid OOM on large migration files
  // Type safety is enforced via separate `tsc --noEmit` checks
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;