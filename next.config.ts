import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL("https://resources.premierleague.com/premierleague25/photos/**")],
  },
  // Pages read data/snapshot.json at request time; make sure it ships with every serverless function.
  outputFileTracingIncludes: {
    "/*": ["./data/snapshot.json"],
  },
};

export default nextConfig;
