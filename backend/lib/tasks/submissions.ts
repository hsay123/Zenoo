/**
 * Submission workflow.
 *
 * Owns everything between "contributor owns an editable task" and "a
 * submission row exists":
 *   - authorization (lease owner, or a prior submitter revising),
 *   - state-machine transitions (claimed/needs_revision -> draft -> submitted,
 *     plus gold outcomes),
 *   - append-only submission insert (never updates a payload),
 *   - duplicate-payload detection,
 *   - fast-submit flagging,
 *   - hidden gold scoring and the resulting `code` review row.
 *
 * `gold_answer` is selected here (server-side only) and never leaves this
 * module in a contributor-facing response.
 */

import { getSupabase } from "@/lib/db/supabase";
import { getEnv, type Env } from "@/lib/env";
import { HttpError } from "@/lib/api/errors";
import { hashCanonicalJson } from "@/lib/hash";
import {
  assertLegalTransition,
  type TaskStatus,
} from "@/lib/tasks/stateMachine";
import { toSubmission, updateTaskStatus } from "@/lib/tasks/repository";
import { insertReview } from "@/lib/review/repository";
import { applyAutoRouting } from "@/lib/review/service";
import { isLeaseExpired } from "@/lib/tasks/leases";
import { isFastSubmission } from "@/lib/tasks/fastSubmitGuard";
import {
  scoreImageBoxes,
  scoreVideoSegments,
  type GoldBox,
  type GoldSegment,
} from "@/lib/tasks/goldScoring";
import {
  validateAnnotation,
  type ValidationContext,
} from "@/lib/annotation/validate";
import type {
  ActionSegmentsPayload,
  DraftSaveResult,
  ImageBoxesPayload,
  Submission,
} from "@/src/types/api";
import type { AnnotationPayload } from "@/lib/validation/payloads";

type Row = Record<string, unknown>;

interface TaskWorkRow {
  id: string;
  job_id: string;
  asset_id: string;
  modality: "image" | "video";
  status: TaskStatus;
  is_gold: boolean;
  gold_answer: unknown;
  lease_owner: string | null;
  lease_expiry: string | null;
}

const TASK_WORK_COLUMNS =
  "id, job_id, asset_id, modality, status, is_gold, gold_answer, lease_owner, lease_expiry";

export type SubmitOutcome = "pending" | "gold_pass" | "gold_fail";

// ------------------------------------------------------------------
// Row mapping
// ------------------------------------------------------------------

async function loadTaskWorkRow(taskId: string): Promise<TaskWorkRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_WORK_COLUMNS)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load task: ${error.message}`);
  if (!data) throw HttpError.notFound("Task not found");

  const row = data as Row;
  return {
    id: row.id as string,
    job_id: row.job_id as string,
    asset_id: row.asset_id as string,
    modality: row.modality as "image" | "video",
    status: row.status as TaskStatus,
    is_gold: Boolean(row.is_gold),
    gold_answer: row.gold_answer ?? null,
    lease_owner: (row.lease_owner as string | null) ?? null,
    lease_expiry: (row.lease_expiry as string | null) ?? null,
  };
}

async function buildValidationContext(
  task: TaskWorkRow,
): Promise<ValidationContext> {
  const supabase = getSupabase();
  const [assetRes, jobRes] = await Promise.all([
    supabase
      .from("assets")
      .select("width, height, duration_ms")
      .eq("id", task.asset_id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("label_list")
      .eq("id", task.job_id)
      .maybeSingle(),
  ]);
  if (assetRes.error) {
    throw HttpError.internal(`Failed to load asset: ${assetRes.error.message}`);
  }
  if (jobRes.error) {
    throw HttpError.internal(`Failed to load job: ${jobRes.error.message}`);
  }

  return {
    taskId: task.id,
    assetId: task.asset_id,
    modality: task.modality,
    labelList: (jobRes.data?.label_list as string[] | undefined) ?? [],
    width: (assetRes.data?.width as number | null | undefined) ?? null,
    height: (assetRes.data?.height as number | null | undefined) ?? null,
    durationMs: (assetRes.data?.duration_ms as number | null | undefined) ?? null,
  };
}

// ------------------------------------------------------------------
// Authorization
// ------------------------------------------------------------------

async function hasPriorSubmission(
  taskId: string,
  contributorId: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("id")
    .eq("task_id", taskId)
    .eq("contributor_id", contributorId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw HttpError.internal(`Failed to load submissions: ${error.message}`);
  }
  return data != null;
}

/**
 * Ensure `contributorId` may edit/draft/submit `task`.
 *
 * Editable states:
 *   - `claimed` / `draft`: must hold a live lease.
 *   - `needs_revision`: holds a live revision lease, or submitted before
 *     (leases are cleared when a submission enters review).
 */
async function assertCanEdit(
  task: TaskWorkRow,
  contributorId: string,
): Promise<void> {
  const leasedToMe = task.lease_owner === contributorId;

  if (task.status === "claimed" || task.status === "draft") {
    if (!leasedToMe) throw HttpError.forbidden("You do not hold this task");
    if (isLeaseExpired(task.lease_expiry)) {
      throw HttpError.conflict("Your lease on this task has expired");
    }
    return;
  }

  if (task.status === "needs_revision") {
    if (leasedToMe && !isLeaseExpired(task.lease_expiry)) return;
    if (await hasPriorSubmission(task.id, contributorId)) return;
    throw HttpError.forbidden("You did not submit this task");
  }

  throw HttpError.conflict(`Task is not editable (status: ${task.status})`);
}

// ------------------------------------------------------------------
// State transitions (exported pure helpers for tests)
// ------------------------------------------------------------------

/** Status path for an autosave. Empty when already a draft. */
export function draftTransitionPath(from: TaskStatus): TaskStatus[] {
  if (from === "draft") return [];
  if (from === "claimed" || from === "needs_revision") {
    assertLegalTransition(from, "draft");
    return ["draft"];
  }
  throw new Error(`Task status ${from} is not editable`);
}

/** Status path for a submit, including the gold outcome tail. */
export function submitTransitionPath(
  from: TaskStatus,
  outcome: SubmitOutcome,
): TaskStatus[] {
  const path: TaskStatus[] = [];
  let status = from;

  if (status === "claimed" || status === "needs_revision") {
    assertLegalTransition(status, "draft");
    path.push("draft");
    status = "draft";
  }

  assertLegalTransition(status, "submitted");
  path.push("submitted");
  status = "submitted";

  if (outcome === "gold_pass") {
    assertLegalTransition(status, "accepted");
    path.push("accepted");
  } else if (outcome === "gold_fail") {
    assertLegalTransition(status, "needs_revision");
    path.push("needs_revision");
  }

  return path;
}

async function applyTaskStatus(
  taskId: string,
  status: TaskStatus,
  { releaseLease = false }: { releaseLease?: boolean } = {},
): Promise<void> {
  await updateTaskStatus(taskId, status, { releaseLease });
}

// ------------------------------------------------------------------
// Draft autosave
// ------------------------------------------------------------------

export async function saveDraftPayload(args: {
  taskId: string;
  contributorId: string;
  payload: AnnotationPayload;
}): Promise<DraftSaveResult> {
  const task = await loadTaskWorkRow(args.taskId);
  await assertCanEdit(task, args.contributorId);

  const path = draftTransitionPath(task.status);
  if (path.length > 0) {
    await applyTaskStatus(task.id, path[path.length - 1]);
  }

  const savedAt = new Date().toISOString();
  const supabase = getSupabase();
  const { error } = await supabase.from("task_drafts").upsert(
    {
      task_id: task.id,
      contributor_id: args.contributorId,
      payload: args.payload,
      updated_at: savedAt,
    },
    { onConflict: "task_id" },
  );
  if (error) throw HttpError.internal(`Failed to save draft: ${error.message}`);

  return { task_id: task.id, saved_at: savedAt };
}

/**
 * Load the contributor's in-progress work for a task: the saved draft if one
 * exists, otherwise the payload of their most recent submission (so a task
 * returned for revision can be corrected in place). Returns `null` payload when
 * the contributor has neither. Authorized only for the lease holder or a prior
 * submitter — never exposes another contributor's work or any gold answer.
 */
export async function loadWorkPayload(args: {
  taskId: string;
  contributorId: string;
}): Promise<{
  payload: AnnotationPayload | null;
  saved_at: string | null;
  source: "draft" | "submission" | null;
}> {
  const task = await loadTaskWorkRow(args.taskId);

  const leasedToMe =
    task.lease_owner === args.contributorId && !isLeaseExpired(task.lease_expiry);
  const prior = await hasPriorSubmission(task.id, args.contributorId);
  if (!leasedToMe && !prior) {
    throw HttpError.forbidden("You do not hold this task");
  }

  const supabase = getSupabase();

  const { data: draft, error: draftError } = await supabase
    .from("task_drafts")
    .select("payload, updated_at")
    .eq("task_id", task.id)
    .eq("contributor_id", args.contributorId)
    .maybeSingle();
  if (draftError) {
    throw HttpError.internal(`Failed to load draft: ${draftError.message}`);
  }
  if (draft) {
    return {
      payload: draft.payload as AnnotationPayload,
      saved_at: (draft.updated_at as string) ?? null,
      source: "draft",
    };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("payload, submitted_at")
    .eq("task_id", task.id)
    .eq("contributor_id", args.contributorId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (submissionError) {
    throw HttpError.internal(`Failed to load submission: ${submissionError.message}`);
  }
  if (submission) {
    return {
      payload: submission.payload as AnnotationPayload,
      saved_at: (submission.submitted_at as string) ?? null,
      source: "submission",
    };
  }

  return { payload: null, saved_at: null, source: null };
}

async function deleteDraft(taskId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("task_drafts")
    .delete()
    .eq("task_id", taskId);
  if (error) throw HttpError.internal(`Failed to clear draft: ${error.message}`);
}

// ------------------------------------------------------------------
// Submit
// ------------------------------------------------------------------

async function findDuplicateSubmission(
  taskId: string,
  payloadHash: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("id")
    .eq("task_id", taskId)
    .eq("payload_hash", payloadHash)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw HttpError.internal(`Failed to check duplicates: ${error.message}`);
  }
  return data != null;
}

async function nextSubmissionVersion(taskId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("version")
    .eq("task_id", taskId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw HttpError.internal(`Failed to read submission version: ${error.message}`);
  }
  return data ? Number(data.version) + 1 : 1;
}

function scoreGold(
  task: TaskWorkRow,
  payload: AnnotationPayload,
  env: Env,
): SubmitOutcome {
  if (!task.is_gold || task.gold_answer == null) return "pending";
  const gold = task.gold_answer as Row;

  if (payload.schema_version === "image-boxes-v1") {
    const goldBoxes = (gold.boxes as GoldBox[] | undefined) ?? [];
    const score = scoreImageBoxes(
      (payload as ImageBoxesPayload).boxes,
      goldBoxes,
      env.GOLD_IOU_THRESHOLD,
    );
    return score.pass ? "gold_pass" : "gold_fail";
  }

  const goldSegments = (gold.segments as GoldSegment[] | undefined) ?? [];
  const score = scoreVideoSegments(
    (payload as ActionSegmentsPayload).segments,
    goldSegments,
    env.GOLD_SEGMENT_MS_TOLERANCE,
  );
  return score.pass ? "gold_pass" : "gold_fail";
}

async function insertSubmission(args: {
  taskId: string;
  contributorId: string;
  version: number;
  payload: AnnotationPayload;
  payloadHash: string;
  fastFlag: boolean;
}): Promise<Submission> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .insert({
      task_id: args.taskId,
      contributor_id: args.contributorId,
      version: args.version,
      payload: args.payload,
      payload_hash: args.payloadHash,
      schema_version: args.payload.schema_version,
      is_fast_flag: args.fastFlag,
    })
    .select("*")
    .single();
  if (error) {
    throw HttpError.internal(`Failed to insert submission: ${error.message}`);
  }
  return toSubmission(data as Row);
}

/**
 * Validate and submit an annotation. Append-only: a new `submissions` row per
 * attempt; the payload is hashed for provenance and duplicate detection.
 *
 * Gold tasks are auto-adjudicated (documented decision): pass -> `accepted` +
 * `accept`/`ACCEPTED` review; fail -> `needs_revision` + `revise`/`GOLD_FAIL`.
 * Non-gold submissions are handed to `applyAutoRouting` (Phase 5), which runs
 * the AI first pass for eligible images or leaves the task in the human queue.
 */
export async function submitAnnotation(args: {
  taskId: string;
  contributorId: string;
  payload: AnnotationPayload;
}): Promise<Submission> {
  const task = await loadTaskWorkRow(args.taskId);
  await assertCanEdit(task, args.contributorId);

  const context = await buildValidationContext(task);
  const issues = validateAnnotation(args.payload, context);
  if (issues.length > 0) {
    throw HttpError.unprocessable("Validation failed", issues);
  }

  const payloadHash = hashCanonicalJson(args.payload);
  if (await findDuplicateSubmission(task.id, payloadHash)) {
    throw HttpError.unprocessable("Validation failed", [
      {
        path: [],
        message: "an identical payload has already been submitted for this task",
        code: "DUPLICATE_PAYLOAD",
      },
    ]);
  }

  const env = getEnv();
  const fastFlag = isFastSubmission({
    leaseExpiry: task.lease_expiry,
    leaseMinutes: env.LEASE_MINUTES,
    thresholdSeconds: env.FAST_SUBMIT_THRESHOLD_SECONDS,
  });

  const version = await nextSubmissionVersion(task.id);
  const outcome = scoreGold(task, args.payload, env);
  const transitionPath = submitTransitionPath(task.status, outcome);
  const finalStatus = transitionPath[transitionPath.length - 1];

  const submission = await insertSubmission({
    taskId: task.id,
    contributorId: args.contributorId,
    version,
    payload: args.payload,
    payloadHash,
    fastFlag,
  });

  // A submitted task no longer holds a lease.
  await applyTaskStatus(task.id, finalStatus, { releaseLease: true });

  if (outcome === "gold_pass") {
    await insertReview({
      submissionId: submission.id,
      reviewerType: "code",
      reviewerId: null,
      decision: "accept",
      reasonCode: "ACCEPTED",
      notes: "Hidden gold task passed.",
    });
  } else if (outcome === "gold_fail") {
    await insertReview({
      submissionId: submission.id,
      reviewerType: "code",
      reviewerId: null,
      decision: "revise",
      reasonCode: "GOLD_FAIL",
      notes: "Hidden gold task failed.",
    });
  }

  await deleteDraft(task.id);

  // Non-gold submissions enter the review workflow (AI first pass or human).
  if (outcome === "pending") {
    await applyAutoRouting(submission.id);
  }

  return submission;
}
