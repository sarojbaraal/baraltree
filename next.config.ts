import type { NextConfig } from "next";

// Build stamp shown (on hover) at the top-right of the app: V<HHmm>_<DD><Mon>, Nepal time.
function buildStamp(): string {
  const d = new Date(Date.now() + (5 * 60 + 45) * 60_000); // UTC+05:45
  const p = (n: number) => String(n).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `V${p(d.getUTCHours())}${p(d.getUTCMinutes())}_${p(d.getUTCDate())}${mon}`;
}

const nextConfig: NextConfig = {
  // Capacitor (Android) loads the static files in `out/`.
  output: "export",
  env: { NEXT_PUBLIC_APP_VER: buildStamp() },
  // Old Next.js auth pages wrote to `profiles` directly (now blocked by design); the app at "/" handles sign-in/up.
  async redirects() {
    return ["login", "signup", "forgot-password"].map((p) => ({
      source: `/auth/${p}`,
      destination: "/",
      permanent: false,
    }));
  },
  // cacheComponents / partialPrefetching (PPR) cannot be used together with `output: "export"`, so they are off on this branch.
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
