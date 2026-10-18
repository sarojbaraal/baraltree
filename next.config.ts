import type { NextConfig } from "next";

// Build stamp shown (on hover) at the top-right of the app: V<HHmm>_<DD><Mon>, Nepal time.
function buildStamp(): string {
  const d = new Date(Date.now() + (5 * 60 + 45) * 60_000); // UTC+05:45
  const p = (n: number) => String(n).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `V${p(d.getUTCHours())}${p(d.getUTCMinutes())}_${p(d.getUTCDate())}${mon}`;
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VER: buildStamp() },
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
