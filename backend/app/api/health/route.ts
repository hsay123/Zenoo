/**
 * Health check route.
 * GET /api/health
 * Public – no auth required.
 */

import { ok } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  return withCors(
    ok({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
    }),
  );
}
