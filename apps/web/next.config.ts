import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep static export optional; local PDF translation requires server routes.
  output: process.env.MORPHIC_STATIC_EXPORT === "1" ? "export" : undefined,
  // next/image optimization is not available in static export.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
