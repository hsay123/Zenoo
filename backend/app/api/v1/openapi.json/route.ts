/**
 * GET /api/v1/openapi.json – the Data API's OpenAPI 3.1 document (no auth).
 */

import { NextResponse, type NextRequest } from "next/server";
import { openApiDocument } from "@/lib/dataapi/openapi";

export async function GET(req: NextRequest) {
  return NextResponse.json(openApiDocument(req.nextUrl.origin), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  });
}
