import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Engine reads Blair's lists from disk at runtime (lib/engine/vocab.ts); ship them with every route.
  outputFileTracingIncludes: { "/**": ["./data/curation/**"] },
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
