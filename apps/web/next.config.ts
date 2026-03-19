import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so Tauri can serve the built files directly.
  output: "export",
  // next/image optimization is not available in static export.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
