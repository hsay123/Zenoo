/**
 * POST /api/reviews/{submissionId}/decision – accept, revise, or reject a
 * submission (reviewer/admin; never the submission's own contributor).
 * 
 * On acceptance, automatically triggers settlement for the task.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { reviewDecisionSchema } from "@/lib/validation/review";
import { decideSubmission } from "@/lib/review/service";
import { settleAcceptedTask } from "@/lib/settlement/service";
import { getSupabase } from "@/lib/db/supabase";
import type { ReviewDecisionInput } from "@/lib/validation/review";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const reviewer = await requireRole(req, "reviewer", "admin");
      const { submissionId } = await params;

      const input: ReviewDecisionInput = reviewDecisionSchema.parse(
        await readJson(req),
      );

      const review = await decideSubmission({
        submissionId,
        reviewer,
        decision: input.decision,
        reasonCode: input.reason_code,
        confidence: input.confidence,
        notes: input.notes,
        rubricVersion: input.rubric_version,
      });

      // If the decision is "accept", trigger settlement for the task
      let receipt = null;
      if (input.decision === "accept") {
        const { loadSubmission } = await import("@/lib/review/repository");
        const { loadTask, toTask } = await import("@/lib/tasks/repository");
        const { settleAcceptedTask } = await import("@/lib/settlement/service");
        
        const submission = await loadSubmission(submissionId);
        const task = toTask(await loadTask(submission.task_id));
        
        // Only settle if the task belongs to a funded, non-demo job
        const { data: job } = await getSupabase()
          .from("jobs")
          .select("funding_status, is_demo")
          .eq("id", task.job_id)
          .maybeSingle();
        
        if (job?.funding_status === "funded" && job?.is_demo === false) {
          try {
            receipt = await settleAcceptedTask({
              taskId: task.id,
              submissionId: submission.id,
            });
          } catch (settleError) {
            // Log the error but don't fail the review decision
            console.error("[settlement] Auto-settlement failed:", settleError);
            // The receipt will be null, and the task will remain in "accepted" state
            // Admin can manually trigger settlement later
          }
        }
      }

      return ok({ review, receipt });
    }),
  );
}