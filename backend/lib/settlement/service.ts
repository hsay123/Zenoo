/**
 * Settlement orchestration (mock).
 *
 * Phase 6: settlement of accepted tasks is recorded against the real
 * JobEscrow contract only when `JOB_ESCROW_ADDRESS` + `RPC_URL` are
 * configured. In every demo/dev environment the `MockSettlementService`
 * produces a deterministic mock transaction hash and sets `is_mock = true`.
 *
 * Invariants enforced here (PRD §10):
 *   - a task can be paid AT MOST ONCE (state `accepted -> paid`);
 *   - total payouts for a job never exceed its funded `budget`;
 *   - a receipt is written for every payout, linked to the hash of the accepted
 *     annotation and the reviewed policy.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import { hashCanonicalJson } from "@/lib/hash";
import { emitZenoEvent } from "@/lib/notify/viasocket";
import {
  loadTask,
  toTask,
  updateTaskStatus,
} from "@/lib/tasks/repository";
import { assertLegalTransition } from "@/lib/tasks/stateMachine";
import { loadSubmission } from "@/lib/review/repository";
import { toJob, type JobRow } from "@/lib/jobs/repository";
import {
  beginSettlement,
  countPaidTasksInJob,
  incrementTasksCompleted,
  insertReceipt,
  listIncompleteSettlements,
  loadAcceptingReview,
  loadReceiptBySubmission,
  loadReceiptRow,
  loadSettlementByTask,
  loadUserWalletAddress,
  markSettlementConfirmed,
  markSettlementFailed,
  markSettlementSubmitted,
  type SettlementRow,
} from "@/lib/settlement/repository";
import { createChainSettlementService } from "@/lib/settlement/chain";
import { runSettlementPreflight } from "@/lib/settlement/preflight";
import { getEnv, type Env } from "@/lib/env";
import { sumDecimalStrings, withinBudget } from "@/lib/settlement/money";
import type {
  EarningsSummary,
  Job,
  PublicReceipt,
  Receipt,
  ReviewerType,
  TaskStatus,
} from "@/src/types/api";

// ------------------------------------------------------------
// Settlement service (mock while the contract is not wired up)
// ------------------------------------------------------------

export interface SettlementResult {
  tx_hash: string | null;
  is_mock: boolean;
}

export interface SettlementRequest {
  jobId: string;
  taskId: string;
  submissionId: string;
  annotationHash: string;
  policyHash: string;
  amount: string;
  /** Contributor payout address; null blocks on-chain settlement. */
  payeeAddress: string | null;
  /**
   * Called as soon as the transaction is broadcast (before confirmation), so
   * the caller can persist the hash and recover if the response is lost.
   */
  onSubmitted?: (txHash: string, isMock: boolean) => void | Promise<void>;
}

export interface SettlementService {
  settle(req: SettlementRequest): Promise<SettlementResult>;
  /**
   * Re-verify a previously broadcast settlement. Returns the result when the
   * transaction is confirmed and matches, otherwise `null`. Used by the
   * crash-recovery path so a payout is never finalised unverified.
   */
  verify?(req: SettlementRequest, txHash: string): Promise<SettlementResult | null>;
}

export class MockSettlementService implements SettlementService {
  private mockHash(req: SettlementRequest): string {
    return hashCanonicalJson({
      task_id: req.taskId,
      submission_id: req.submissionId,
      amount: req.amount,
      mock: true,
    });
  }

  async settle(req: SettlementRequest): Promise<SettlementResult> {
    const tx_hash = this.mockHash(req);
    await req.onSubmitted?.(tx_hash, true);
    return { tx_hash, is_mock: true };
  }

  async verify(req: SettlementRequest, txHash: string): Promise<SettlementResult | null> {
    const expected = this.mockHash(req);
    return txHash === expected ? { tx_hash: expected, is_mock: true } : null;
  }
}

export const mockSettlementService = new MockSettlementService();

/**
 * Chain settlement when `JOB_ESCROW_ADDRESS` + `RPC_URL` +
 * `SETTLEMENT_PRIVATE_KEY` are all configured **and** the fail-closed preflight
 * passes, otherwise the mock. Selected lazily (not at import time) so tests can
 * inject their own service.
 */
export type SettlementPreflightFn = (env: Env) => Promise<{
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}>;

export interface SelectSettlementServiceOptions {
  env?: Env;
  chainFactory?: (env: Env) => SettlementService | null;
  preflight?: SettlementPreflightFn;
}

/**
 * Choose the settlement service for the current environment.
 *
 * Real (on-chain) settlement is selected ONLY when the escrow/RPC/key are all
 * configured AND the preflight passes. In every other case — not configured,
 * RPC error, wrong chain, stale escrow, invalid owner/relayer split, or a
 * missing/violated deny-list — the platform stays on `MockSettlementService`,
 * so every receipt remains honestly `is_mock = true` and no transaction is ever
 * signed by an unverified signer.
 */
export async function selectSettlementService(
  options: SelectSettlementServiceOptions = {},
): Promise<SettlementService> {
  const env = options.env ?? getEnv();
  const chainFactory = options.chainFactory ?? createChainSettlementService;
  const preflight = options.preflight ?? ((value: Env) => runSettlementPreflight(value));

  const chain = chainFactory(env);
  if (!chain) return mockSettlementService;

  try {
    const report = await preflight(env);
    if (report.ok) return chain;
    const failed = report.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.name}: ${check.detail}`);
    console.warn(
      "[settlement] real settlement is configured but the safety preflight failed; " +
        `falling back to MockSettlementService (is_mock = true). ${failed.join(" | ")}`,
    );
  } catch (error) {
    console.warn(
      "[settlement] safety preflight could not be evaluated " +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        "falling back to MockSettlementService (is_mock = true).",
    );
  }

  return mockSettlementService;
}

let _defaultService: Promise<SettlementService> | null = null;

/**
 * The process-wide default service. Memoised so the preflight (a handful of
 * read-only RPC calls) runs once per warm instance instead of on every payout.
 */
export function getDefaultSettlementService(): Promise<SettlementService> {
  if (!_defaultService) {
    _defaultService = selectSettlementService();
  }
  return _defaultService;
}

// ------------------------------------------------------------
// Settlement of an accepted task
// ------------------------------------------------------------

async function loadJobForSettlement(jobId: string): Promise<Job> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load job: ${error.message}`);
  if (!data) throw HttpError.notFound("Job not found");
  return toJob(data as JobRow);
}

export interface SettleAcceptedTaskInput {
  taskId: string;
  submissionId: string;
  settlementService?: SettlementService;
}

/**
 * Settle an accepted task.
 *
 * Crash-safe and idempotent:
 *   1. a `settlements` row (unique per task) is written BEFORE the chain call;
 *   2. the broadcast hash is persisted as soon as it is known;
 *   3. the receipt + task transition happen only after the payout is verified;
 *   4. a retry reuses the existing row and never broadcasts a second payout.
 */
export async function settleAcceptedTask(
  input: SettleAcceptedTaskInput,
): Promise<Receipt> {
  const service = input.settlementService ?? (await getDefaultSettlementService());

  const submission = await loadSubmission(input.submissionId);
  if (submission.task_id !== input.taskId) {
    throw HttpError.conflict("Submission does not belong to this task");
  }

  const task = toTask(await loadTask(input.taskId));

  // A confirmed settlement is final, even if the task row lags behind.
  const recorded = await loadSettlementByTask(input.taskId);
  if (recorded?.status === "confirmed") {
    const existingReceipt = await loadReceiptBySubmission(input.submissionId);
    if (existingReceipt) return existingReceipt;
    throw HttpError.internal("Settlement is confirmed but its receipt is missing");
  }

  if (task.status !== "accepted" && task.status !== "paid") {
    throw HttpError.conflict("Task is not in an accepted state");
  }
  if (task.status === "paid" && !recorded) {
    throw HttpError.conflict("Task has already been paid");
  }

  const job = await loadJobForSettlement(task.job_id);
  const acceptingReview = await loadAcceptingReview(input.submissionId);
  const annotationHash = submission.payload_hash;
  const policyHash = job.policy_hash ?? hashCanonicalJson(job.rubric ?? {});
  const payeeAddress = await loadUserWalletAddress(submission.contributor_id);

  const baseRequest: SettlementRequest = {
    jobId: task.job_id,
    taskId: input.taskId,
    submissionId: input.submissionId,
    annotationHash,
    policyHash,
    amount: job.reward_per_task,
    payeeAddress,
  };

  // Open (or fetch) the single settlement row before touching the chain.
  const row = await beginSettlement({
    taskId: task.id,
    submissionId: input.submissionId,
    jobId: task.job_id,
    contributorId: submission.contributor_id,
    amount: job.reward_per_task,
    annotationHash,
    policyHash,
    reviewRef: acceptingReview?.id ?? null,
  });

  // Already broadcast (crash between broadcast and receipt): re-verify; never re-pay.
  if (row.tx_hash) {
    const verified = service.verify ? await service.verify(baseRequest, row.tx_hash) : null;
    if (!verified) {
      await markSettlementFailed(row.id, "Broadcast settlement could not be verified");
      throw HttpError.conflict("Settlement was broadcast but could not be verified");
    }
    return finalizeSettlement(row, verified);
  }

  // Budget guard, only when we are about to actually pay.
  const paidCount = await countPaidTasksInJob(task.job_id);
  if (!withinBudget(job.reward_per_task, paidCount + 1, job.budget)) {
    await markSettlementFailed(row.id, "Job budget exhausted");
    throw HttpError.conflict("Job budget exhausted");
  }

  let result: SettlementResult;
  try {
    result = await service.settle({
      ...baseRequest,
      onSubmitted: (txHash, isMock) => markSettlementSubmitted(row.id, txHash, isMock),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settlement failed";
    await markSettlementFailed(row.id, message);
    throw error;
  }

  return finalizeSettlement(row, result);
}

/**
 * Persist the receipt and move the task to `paid`. Idempotent: a retry after a
 * partial failure reuses the existing receipt and transitions the task once.
 */
async function finalizeSettlement(
  row: SettlementRow,
  result: SettlementResult,
): Promise<Receipt> {
  let receipt = await loadReceiptBySubmission(row.submission_id);
  if (!receipt) {
    receipt = await insertReceipt({
      submissionId: row.submission_id,
      annotationHash: row.annotation_hash,
      policyHash: row.policy_hash ?? "",
      reviewRef: row.review_ref,
      txHash: result.tx_hash,
      isMock: result.is_mock,
    });
  }

  await markSettlementConfirmed(row.id, result.tx_hash, result.is_mock, receipt.id);

  const task = toTask(await loadTask(row.task_id));
  if (task.status !== "paid") {
    assertLegalTransition(task.status, "paid");
    await updateTaskStatus(row.task_id, "paid");
    await incrementTasksCompleted(row.contributor_id);
    emitZenoEvent("payout.settled", {
      receipt_id: receipt.id,
      job_id: row.job_id,
      task_id: row.task_id,
      amount_usdc: row.amount,
      tx_hash: result.tx_hash,
      is_mock: result.is_mock,
    });
  }

  return receipt;
}

/**
 * Reconcile incomplete settlements: finalise any row that already broadcast a
 * transaction (after re-verifying it on-chain) and report the rest. Admin-facing.
 */
export async function reconcileSettlements(
  service?: SettlementService,
): Promise<{ finalized: string[]; unresolved: SettlementRow[] }> {
  const active = service ?? (await getDefaultSettlementService());
  const incomplete = await listIncompleteSettlements();
  const finalized: string[] = [];
  const unresolved: SettlementRow[] = [];

  for (const row of incomplete) {
    if (row.tx_hash && active.verify) {
      // Re-verify against the contributor's real payout address. Passing `null`
      // here can never match the on-chain `TaskSettled.payee`, so a genuine
      // settlement would be stuck unresolved forever (and a recovery could not
      // finalise it). A contributor with no wallet address stays unresolved.
      const payeeAddress = await loadUserWalletAddress(row.contributor_id);
      const request: SettlementRequest = {
        jobId: row.job_id,
        taskId: row.task_id,
        submissionId: row.submission_id,
        annotationHash: row.annotation_hash,
        policyHash: row.policy_hash ?? "",
        amount: row.amount,
        payeeAddress,
      };
      const verified = await active.verify(request, row.tx_hash);
      if (verified) {
        await finalizeSettlement(row, verified);
        finalized.push(row.id);
        continue;
      }
    }
    unresolved.push(row);
  }

  return { finalized, unresolved };
}

// ------------------------------------------------------------
// Public receipt lookup (GET /api/receipts/{id}, no auth)
// ------------------------------------------------------------

export async function getPublicReceipt(receiptId: string): Promise<PublicReceipt> {
  const row = await loadReceiptRow(receiptId);
  const supabase = getSupabase();

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("task_id")
    .eq("id", row.submission_id)
    .maybeSingle();
  if (submissionError) {
    throw HttpError.internal(`Failed to load receipt submission: ${submissionError.message}`);
  }
  if (!submission?.task_id) {
    throw HttpError.internal("Receipt submission is missing");
  }

  let reviewerType: ReviewerType | null = null;
  const reviewRef = (row.review_ref as string | null) ?? null;
  if (reviewRef) {
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("reviewer_type")
      .eq("id", reviewRef)
      .maybeSingle();
    if (reviewError) {
      throw HttpError.internal(`Failed to load receipt review: ${reviewError.message}`);
    }
    reviewerType = (review?.reviewer_type as ReviewerType | undefined) ?? null;
  }

  return {
    id: row.id as string,
    task_id: submission.task_id as string,
    policy_hash: row.policy_hash as string,
    annotation_hash: row.annotation_hash as string,
    reviewer_type: reviewerType,
    tx_hash: (row.tx_hash as string | null) ?? null,
    is_mock: Boolean(row.is_mock),
    created_at: row.created_at as string,
  };
}

// ------------------------------------------------------------
// Contributor earnings summary (GET /api/earnings)
// ------------------------------------------------------------

type EarningsRow = {
  id: string;
  task_id: string;
  version: number;
  submitted_at: string;
  task: { job_id: string; status: TaskStatus };
};

export async function getEarningsSummary(
  contributorId: string,
): Promise<EarningsSummary> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("id, task_id, version, submitted_at, task:tasks!inner(job_id, status)")
    .eq("contributor_id", contributorId)
    .order("version", { ascending: false });
  if (error) throw HttpError.internal(`Failed to load earnings: ${error.message}`);

  // Dedupe by task, keeping the highest submission version for each.
  const unique = new Map<string, EarningsRow>();
  for (const raw of data ?? []) {
    const row = raw as unknown as EarningsRow;
    if (!unique.has(row.task_id)) unique.set(row.task_id, row);
  }
  const taskRows = Array.from(unique.values());

  const jobIds = Array.from(new Set(taskRows.map((r) => r.task.job_id)));
  const jobMap = new Map<string, { title: string; reward_per_task: string }>();
  if (jobIds.length > 0) {
    const { data: jobs, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, reward_per_task")
      .in("id", jobIds);
    if (jobError) {
      throw HttpError.internal(`Failed to load earnings jobs: ${jobError.message}`);
    }
    for (const job of jobs ?? []) {
      jobMap.set(job.id as string, {
        title: job.title as string,
        reward_per_task: String(job.reward_per_task),
      });
    }
  }

  const submissionIds = taskRows.map((r) => r.id);
  const receiptBySubmission = new Map<
    string,
    { id: string; tx_hash: string | null; is_mock: boolean }
  >();
  if (submissionIds.length > 0) {
    const { data: receipts, error: receiptError } = await supabase
      .from("receipts")
      .select("id, submission_id, tx_hash, is_mock")
      .in("submission_id", submissionIds);
    if (receiptError) {
      throw HttpError.internal(`Failed to load earnings receipts: ${receiptError.message}`);
    }
    for (const receipt of receipts ?? []) {
      receiptBySubmission.set(receipt.submission_id as string, {
        id: receipt.id as string,
        tx_hash: (receipt.tx_hash as string | null) ?? null,
        is_mock: Boolean(receipt.is_mock),
      });
    }
  }

  const tasks = taskRows
    .map((row) => {
      const job = jobMap.get(row.task.job_id) ?? { title: "", reward_per_task: "0" };
      const receipt = receiptBySubmission.get(row.id);
      return {
        task_id: row.task_id,
        // Latest version's id, so a contributor can act on the frozen version
        // (e.g. appeal a rejection) without a separate submissions endpoint.
        submission_id: row.id,
        job_title: job.title,
        status: row.task.status,
        reward: job.reward_per_task,
        submitted_at: row.submitted_at,
        // `is_mock` lets the UI label a mocked payout honestly instead of
        // implying every hash is an on-chain transaction.
        receipt_id: receipt?.id ?? null,
        settlement_is_mock: receipt ? receipt.is_mock : null,
        tx_hash: receipt?.tx_hash ?? null,
      };
    })
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));

  const paid = tasks.filter((t) => t.status === "paid");
  const pending = tasks.filter((t) => t.status === "accepted");

  return {
    total_accepted: paid.length + pending.length,
    total_paid: sumDecimalStrings(paid.map((t) => t.reward)),
    total_pending: sumDecimalStrings(pending.map((t) => t.reward)),
    tasks,
  };
}