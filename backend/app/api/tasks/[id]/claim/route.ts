/**
 * POST /api/tasks/{id}/claim – atomically claim a task lease (contributor).
 *
 * Guarantees:
 *   - Atomic: the write is `UPDATE ... WHERE status = 'available'`; a losing
 *     racer sees zero rows updated and receives 409.
 *   - Idempotent: an `Idempotency-Key` header makes retries replay the first
 *     response (stored in `idempotency_keys`).
 *   - Rate limited per contributor.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { withIdempotency } from "@/lib/idempotency";
import { consume } from "@/lib/rateLimit";
import { isLeaseExpired, leaseExpiryFromNow, releaseExpiredLeases } from "@/lib/tasks/leases";
import {
  TASK_PUBLIC_COLUMNS,
  getAssetObjectKey,
  loadTask,
  type TaskRow,
} from "@/lib/tasks/repository";
import { getJobStatus } from "@/lib/jobs/repository";
import { createSignedMediaUrl } from "@/lib/storage";
import { getSupabase } from "@/lib/db/supabase";
import type { ClaimResult } from "@/src/types/api";
import { getEnv } from "@/lib/env";
import { claimBlockReason } from "@/lib/reputation/score";
import { getContributorReputation } from "@/lib/reputation/service";

const CLAIM_RATE = { points: 30, duration: 60 };

async function buildResult(
  taskId: string,
  assetId: string,
  leaseExpiry: string,
): Promise<ClaimResult> {
  const objectKey = await getAssetObjectKey(assetId);
  const signedMediaUrl = await createSignedMediaUrl(objectKey);
  return { task_id: taskId, lease_expiry: leaseExpiry, signed_media_url: signedMediaUrl };
}

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "contributor");
      const { id } = await params;

      const result = await withIdempotency<ClaimResult>({
        endpoint: `POST /api/tasks/${id}/claim`,
        userId: user.id,
        rawKey: req.headers.get("idempotency-key"),
        action: async () => {
          await consume("claim", user.id, CLAIM_RATE);

          // Free up this task if its previous lease already expired.
          await releaseExpiredLeases(id);

          const task = await loadTask(id);

          // Same contributor still holds a live lease – return it as-is.
          if (
            (task.status === "claimed" || task.status === "draft") &&
            task.lease_owner === user.id &&
            !isLeaseExpired(task.lease_expiry as string | null)
          ) {
            return buildResult(id, task.asset_id as string, task.lease_expiry as string);
          }

          // A paused or closed job accepts no new claims. Contributors who
          // already hold a live lease are unaffected (handled above).
          const jobStatus = await getJobStatus(task.job_id as string);
          if (jobStatus !== "published") {
            throw HttpError.conflict("Job is not open for claiming");
          }

          const supabase = getSupabase();

          // Only funded jobs' tasks are claimable (matches GET /tasks/available):
          // work on an unfunded job could never be paid from escrow.
          const { data: jobFunding, error: fundingError } = await supabase
            .from("jobs")
            .select("funding_status")
            .eq("id", task.job_id as string)
            .maybeSingle();
          if (fundingError) {
            throw HttpError.internal(`Failed to load job funding: ${fundingError.message}`);
          }
          if (jobFunding?.funding_status !== "funded") {
            throw HttpError.conflict("Job is not funded yet");
          }

          // Reputation gating (HHG F4), enforced server-side.
          const reputation = await getContributorReputation(user.id, getEnv());
          if (reputation.gating) {
            const blocked = claimBlockReason(reputation.tier, {
              is_gold: Boolean(task.is_gold),
              modality: task.modality as "image" | "video",
            });
            if (blocked) throw HttpError.forbidden(blocked);
          }

          const leaseExpiry = leaseExpiryFromNow();
          const { data, error } = await supabase
            .from("tasks")
            .update({
              status: "claimed",
              lease_owner: user.id,
              lease_expiry: leaseExpiry,
            })
            .eq("id", id)
            .eq("status", "available")
            .select(TASK_PUBLIC_COLUMNS)
            .maybeSingle();

          if (error) throw HttpError.internal(`Failed to claim task: ${error.message}`);

          if (!data) {
            // Lost the race (or task not available). Re-read for a clearer error.
            const current = await loadTask(id);
            if (current.lease_owner === user.id && !isLeaseExpired(current.lease_expiry as string | null)) {
              return buildResult(id, current.asset_id as string, current.lease_expiry as string);
            }
            throw HttpError.conflict("Task is not available to claim");
          }

          const row = data as TaskRow;
          return buildResult(id, row.asset_id as string, row.lease_expiry as string);
        },
      });

      return ok(result);
    }),
  );
}
