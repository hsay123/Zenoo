/**
 * GET /api/v1/datasets – the organisation's datasets (Data API, API key).
 * See docs/system/DATA-API.md §4.
 */

import { NextResponse, type NextRequest } from "next/server";
import { listOrganizationJobs } from "@/lib/dataapi/repository";
import { toDataset, v1 } from "@/lib/dataapi/handler";

export async function GET(req: NextRequest) {
  return v1(req, "datasets:read", async (actor) => {
    const jobs = await listOrganizationJobs(actor.organizationId);
    const data = await Promise.all(jobs.map(toDataset));
    return { response: NextResponse.json({ data }) };
  });
}
