import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The full-featured Vansavali app (public/index.html + app.js) is the home page.
  // The in-progress Next.js rewrite lives at /preview until it reaches feature parity.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  cacheComponents: true,
  partialPrefetching: true,
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
