/**
 * GET /api/v1/usage – this month's requests and records for the key's
 * organisation (Data API). This call itself is counted too.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import { API_RATE_LIMIT } from "@/lib/dataapi/auth";
import { v1 } from "@/lib/dataapi/handler";

export async function GET(req: NextRequest) {
  return v1(req, "datasets:read", async (actor) => {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const { data, error } = await getSupabase()
      .from("api_usage")
      .select("requests, records")
      .eq("organization_id", actor.organizationId)
      .eq("month", month)
      .maybeSingle();
    if (error) throw HttpError.internal(`Failed to load usage: ${error.message}`);
    return {
      response: NextResponse.json({
        data: {
          month,
          requests: Number(data?.requests ?? 0),
          records: Number(data?.records ?? 0),
          plan: "api",
          rate_limit: { requests: API_RATE_LIMIT.points, per_seconds: API_RATE_LIMIT.duration },
        },
      }),
    };
  });
}
