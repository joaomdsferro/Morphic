import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for a fully browser-deployable build.
  output: "export",
  // next/image optimization is not available in static export.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
