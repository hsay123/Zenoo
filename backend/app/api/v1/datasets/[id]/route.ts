/**
 * GET /api/v1/datasets/{id} – one dataset with its provenance (Data API).
 * Another organisation's dataset is a 404, never a 403 (no existence leak).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/db/supabase";
import { loadOrganizationJob } from "@/lib/dataapi/repository";
import { toDataset, v1 } from "@/lib/dataapi/handler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return v1(req, "datasets:read", async (actor) => {
    const { id } = await params;
    const job = await loadOrganizationJob(actor.organizationId, id);
    const { data: project } = await getSupabase()
      .from("projects")
      .select("data_rights, retention_policy")
      .eq("id", job.project_id)
      .maybeSingle();
    const data = {
      ...(await toDataset(job)),
      provenance: {
        rights_reference: (project?.data_rights as string | null) ?? null,
        retention_policy: (project?.retention_policy as string | null) ?? null,
        review_policy_version: job.policy_hash,
        chain_job_id: job.chain_job_id,
        funding_tx_hash: job.funding_tx_hash,
      },
    };
    return { response: NextResponse.json({ data }) };
  });
}
