import path from "node:path";
import type { NextConfig } from "next";

/**
 * Base URL of the platform API as reached *from the dev server*.
 *
 * The browser never talks to this URL directly. In development the app is
 * served over HTTPS on `localhost` (see the `dev` script) and the API is
 * proxied through this same origin under `/platform`. Same-origin proxying
 * avoids mixed-content blocking (an https page cannot call an http API) and
 * keeps a single browser origin.
 */
const platformApiUrl =
  process.env.PLATFORM_API_URL ?? "http://localhost:3010";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        // /platform/api/me  →  http://localhost:3010/api/me
        source: "/platform/:path*",
        destination: `${platformApiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
