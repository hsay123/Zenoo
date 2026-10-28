/**
 * Receipt row mapping + persistence.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { Receipt, ReviewerType } from "@/src/types/api";

type Row = Record<string, unknown>;

export function toReceipt(row: Row): Receipt {
  return {
    id: row.id as string,
    submission_id: row.submission_id as string,
    annotation_hash: row.annotation_hash as string,
    policy_hash: row.policy_hash as string,
    review_ref: (row.review_ref as string | null) ?? null,
    tx_hash: (row.tx_hash as string | null) ?? null,
    is_mock: Boolean(row.is_mock),
    created_at: row.created_at as string,
  };
}

export interface InsertReceiptInput {
  submissionId: string;
  annotationHash: string;
  policyHash: string;
  reviewRef: string | null;
  txHash: string | null;
  isMock: boolean;
}

export async function insertReceipt(input: InsertReceiptInput): Promise<Receipt> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("receipts")
    .insert({
      submission_id: input.submissionId,
      annotation_hash: input.annotationHash,
      policy_hash: input.policyHash,
      review_ref: input.reviewRef,
      tx_hash: input.txHash,
      is_mock: input.isMock,
    })
    .select("*")
    .single();
  if (error) throw HttpError.internal(`Failed to record receipt: ${error.message}`);
  return toReceipt(data as Row);
}

/** Load a receipt row by id, or throw 404. */
export async function loadReceiptRow(receiptId: string): Promise<Row> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load receipt: ${error.message}`);
  if (!data) throw HttpError.notFound("Receipt not found");
  return data as Row;
}

/** Latest accept review for a submission, if any. */
export async function loadAcceptingReview(
  submissionId: string,
): Promise<{ id: string; reviewer_type: ReviewerType } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, reviewer_type")
    .eq("submission_id", submissionId)
    .eq("decision", "accept")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load review: ${error.message}`);
  if (!data) return null;
  return data as unknown as { id: string; reviewer_type: ReviewerType };
}

/** Contributor payout address (null when the account has no wallet). */
export async function loadUserWalletAddress(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("wallet_address")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load payout address: ${error.message}`);
  return (data?.wallet_address as string | null) ?? null;
}

/** Number of already-paid tasks in a job (for the budget guard). */
export async function countPaidTasksInJob(jobId: string): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", "paid");
  if (error) throw HttpError.internal(`Failed to count paid tasks: ${error.message}`);
  return count ?? 0;
}

/** Increment a contributor's completed-task counter (read-modify-write). */
export async function incrementTasksCompleted(userId: string): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("contributor_profiles")
    .select("tasks_completed")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load profile: ${error.message}`);
  if (!data) return;
  const next = (data.tasks_completed as number | null ?? 0) + 1;
  const { error: updateError } = await supabase
    .from("contributor_profiles")
    .update({ tasks_completed: next })
    .eq("user_id", userId);
  if (updateError) {
    throw HttpError.internal(`Failed to update profile: ${updateError.message}`);
  }
}

// ------------------------------------------------------------
// Settlement ledger (crash-safe, one row per task)
// ------------------------------------------------------------

export type SettlementStatus = "pending" | "submitted" | "confirmed" | "failed";

export interface SettlementRow {
  id: string;
  task_id: string;
  submission_id: string;
  job_id: string;
  contributor_id: string;
  status: SettlementStatus;
  tx_hash: string | null;
  is_mock: boolean | null;
  amount: string;
  annotation_hash: string;
  policy_hash: string | null;
  review_ref: string | null;
  receipt_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function toSettlement(row: Row): SettlementRow {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    submission_id: row.submission_id as string,
    job_id: row.job_id as string,
    contributor_id: row.contributor_id as string,
    status: row.status as SettlementStatus,
    tx_hash: (row.tx_hash as string | null) ?? null,
    is_mock: (row.is_mock as boolean | null) ?? null,
    amount: String(row.amount),
    annotation_hash: row.annotation_hash as string,
    policy_hash: (row.policy_hash as string | null) ?? null,
    review_ref: (row.review_ref as string | null) ?? null,
    receipt_id: (row.receipt_id as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export interface BeginSettlementInput {
  taskId: string;
  submissionId: string;
  jobId: string;
  contributorId: string;
  amount: string;
  annotationHash: string;
  policyHash: string | null;
  reviewRef: string | null;
}

/**
 * Open (or fetch) the single settlement row for a task.
 *
 * Uses `ON CONFLICT (task_id) DO NOTHING`, so a retried or concurrent call
 * never creates a second row: the existing row is returned instead. The caller
 * decides, from its `status`, whether to broadcast, recover, or return.
 */
export async function beginSettlement(input: BeginSettlementInput): Promise<SettlementRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("settlements")
    .upsert(
      {
        task_id: input.taskId,
        submission_id: input.submissionId,
        job_id: input.jobId,
        contributor_id: input.contributorId,
        amount: input.amount,
        annotation_hash: input.annotationHash,
        policy_hash: input.policyHash,
        review_ref: input.reviewRef,
      },
      { onConflict: "task_id", ignoreDuplicates: true },
    )
    .select("*");

  if (error) throw HttpError.internal(`Failed to open settlement: ${error.message}`);
  if (data && data.length > 0) return toSettlement(data[0] as Row);

  const existing = await loadSettlementByTask(input.taskId);
  if (!existing) throw HttpError.internal("Settlement row missing after insert");
  return existing;
}

export async function loadSettlementByTask(taskId: string): Promise<SettlementRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .eq("task_id", taskId)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load settlement: ${error.message}`);
  return data ? toSettlement(data as Row) : null;
}

/** Record the broadcast transaction hash, as soon as it is known. */
export async function markSettlementSubmitted(
  id: string,
  txHash: string,
  isMock: boolean,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("settlements")
    .update({ status: "submitted", tx_hash: txHash, is_mock: isMock, error: null })
    .eq("id", id);
  if (error) throw HttpError.internal(`Failed to record settlement tx: ${error.message}`);
}

export async function markSettlementConfirmed(
  id: string,
  txHash: string | null,
  isMock: boolean,
  receiptId: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("settlements")
    .update({
      status: "confirmed",
      tx_hash: txHash,
      is_mock: isMock,
      receipt_id: receiptId,
      error: null,
    })
    .eq("id", id);
  if (error) throw HttpError.internal(`Failed to confirm settlement: ${error.message}`);
}

export async function markSettlementFailed(id: string, message: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("settlements")
    .update({ status: "failed", error: message })
    .eq("id", id);
  if (error) throw HttpError.internal(`Failed to mark settlement failed: ${error.message}`);
}

/** Existing receipt for a submission, if the settlement already produced one. */
export async function loadReceiptBySubmission(submissionId: string): Promise<Receipt | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load receipt: ${error.message}`);
  return data ? toReceipt(data as Row) : null;
}

/** Incomplete settlements, newest first (admin reconciliation view). */
export async function listIncompleteSettlements(): Promise<SettlementRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .in("status", ["pending", "submitted", "failed"])
    .order("created_at", { ascending: false });
  if (error) throw HttpError.internal(`Failed to list settlements: ${error.message}`);
  return (data ?? []).map((row) => toSettlement(row as Row));
}