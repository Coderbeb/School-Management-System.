import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // This is the correct way to allow origins for Server Actions
    serverActions: {
      allowedOrigins: ["192.168.1.41:3000", "localhost:3000","10.88.86.215:3000"],
    },
  },
};

export default nextConfig;