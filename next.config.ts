import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Engine and connectors read data/curation (Blair) and data/snapshots (connector inputs) at runtime.
  outputFileTracingIncludes: { "/**": ["./data/curation/**", "./data/snapshots/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
