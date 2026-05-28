import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray ~/package-lock.json otherwise misleads inference.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
