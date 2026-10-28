/**
 * CORS helper for API routes.
 * Allows requests from FRONTEND_ORIGIN only.
 */

import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export function getCorsHeaders(): Record<string, string> {
  const env = getEnv();
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-dev-user-id, Idempotency-Key",
    "Access-Control-Allow-Credentials": "true",
  };
}

/** Handle OPTIONS preflight */
export function corsOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

/** Apply CORS headers to any NextResponse */
export function withCors(response: NextResponse): NextResponse {
  const headers = getCorsHeaders();
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
