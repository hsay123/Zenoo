/**
 * Buyer funding by card/UPI (HHG F2).
 *
 *   buyer      POST /jobs/{id}/fund/checkout  -> job_payments row (created)
 *                                              -> Dodo checkout URL
 *   Dodo       POST /payments/dodo/webhook    -> signature verified, payment
 *                                                re-fetched from Dodo's API
 *              payment verified               -> row paid; job funding pending
 *   treasury   approve + fundJob on escrow    -> JobFunded verified
 *                                              -> row funded; job funded
 *
 * Every state change is a conditional update on the current status, so a
 * redelivered webhook or a concurrent retry cannot apply twice. If the
 * treasury is not configured or funding fails, the payment stays `paid`
 * ("paid, awaiting funding") and the job stays `pending` — never `funded`.
 */

import { keccak256, stringToHex, type Hex } from "viem";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { Env } from "@/lib/env";
import type { AuthUser } from "@/lib/auth/verifyToken";
import type { Job } from "@/src/types/api";
import { fromTokenUnits } from "@/lib/settlement/network";
import { quoteFunding } from "@/lib/funding/pricing";
import {
  createCheckout,
  dodoConfig,
  getPayment,
  type DodoConfig,
  type DodoPayment,
} from "@/lib/funding/dodo";
import { createTreasuryFunder, type TreasuryFunder } from "@/lib/funding/treasury";

export type PaymentStatus = "created" | "paid" | "funding" | "funded" | "failed";

export interface JobPayment {
  id: string;
  job_id: string;
  buyer_id: string;
  provider: "dodo";
  status: PaymentStatus;
  checkout_session_id: string | null;
  provider_payment_id: string | null;
  amount_cents: number;
  currency: string;
  payout_amount: string;
  fee_amount: string;
  funding_tx_hash: string | null;
  error: string | null;
  paid_at: string | null;
  funded_at: string | null;
  created_at: string;
}

function toPayment(row: Record<string, unknown>): JobPayment {
  return {
    ...(row as unknown as JobPayment),
    amount_cents: Number(row.amount_cents),
    payout_amount: String(row.payout_amount),
    fee_amount: String(row.fee_amount),
  };
}

/** Same derivation as POST /jobs/{id}/fund: keccak256(utf8(job uuid)). */
export function chainJobIdFor(jobId: string): Hex {
  return keccak256(stringToHex(jobId));
}

// ------------------------------------------------------------------ reads

/** Latest payment for a job, or null (also null if migration 011 is missing). */
export async function loadLatestPayment(jobId: string): Promise<JobPayment | null> {
  const { data, error } = await getSupabase()
    .from("job_payments")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? toPayment(data as Record<string, unknown>) : null;
}

async function loadPayment(id: string): Promise<JobPayment | null> {
  const { data, error } = await getSupabase()
    .from("job_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load payment: ${error.message}`);
  return data ? toPayment(data as Record<string, unknown>) : null;
}

async function updatePayment(
  id: string,
  from: PaymentStatus[],
  patch: Record<string, unknown>,
): Promise<JobPayment | null> {
  const { data, error } = await getSupabase()
    .from("job_payments")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("*")
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to update payment: ${error.message}`);
  return data ? toPayment(data as Record<string, unknown>) : null;
}

// --------------------------------------------------------------- checkout

export async function createCardCheckout(
  job: Job,
  buyer: AuthUser,
  env: Env,
  deps: { config?: DodoConfig | null; create?: typeof createCheckout } = {},
): Promise<{ payment_id: string; checkout_url: string }> {
  const config = deps.config === undefined ? dodoConfig(env) : deps.config;
  if (!config) throw HttpError.conflict("Card/UPI payments are not enabled");
  if (job.status !== "published") throw HttpError.conflict("Job must be published before funding");
  if (job.funding_status !== "unfunded") {
    throw HttpError.conflict("Job funding is already pending or complete");
  }

  const quote = quoteFunding(String(job.budget), env.ZENO_FEE_BPS);
  const supabase = getSupabase();
  const { data: row, error } = await supabase
    .from("job_payments")
    .insert({
      job_id: job.id,
      buyer_id: buyer.id,
      provider: "dodo",
      status: "created",
      amount_cents: quote.total_cents,
      currency: "USD",
      payout_amount: quote.payout,
      fee_amount: quote.fee,
    })
    .select("*")
    .single();
  if (error || !row) {
    throw HttpError.internal(`Failed to record payment: ${error?.message ?? "no row"}`);
  }
  const payment = toPayment(row as Record<string, unknown>);

  const checkout = await (deps.create ?? createCheckout)(config, {
    amountCents: quote.total_cents,
    metadata: { zeno_payment_id: payment.id, job_id: job.id },
    returnUrl: `${env.FRONTEND_ORIGIN}/workspace/buyer/jobs/${job.id}?payment=return`,
    customerEmail: buyer.email,
  });

  await supabase
    .from("job_payments")
    .update({ checkout_session_id: checkout.session_id })
    .eq("id", payment.id);

  return { payment_id: payment.id, checkout_url: checkout.checkout_url };
}

// ---------------------------------------------------------------- webhook

export type WebhookOutcome =
  | { handled: false; reason: string }
  | { handled: true; payment_id: string; state: PaymentStatus | "awaiting_funding" };

/**
 * Apply a verified `payment.succeeded` event. The event body is only a hint:
 * the payment is re-fetched from Dodo's API and checked (status, currency,
 * amount, our metadata) before anything changes.
 */
export async function applyPaymentSucceeded(
  data: Record<string, unknown>,
  env: Env,
  deps: {
    config?: DodoConfig | null;
    fetchPayment?: (config: DodoConfig, id: string) => Promise<DodoPayment>;
    treasury?: TreasuryFunder | null;
  } = {},
): Promise<WebhookOutcome> {
  const config = deps.config === undefined ? dodoConfig(env) : deps.config;
  if (!config) return { handled: false, reason: "Dodo is not configured" };

  const providerPaymentId = typeof data.payment_id === "string" ? data.payment_id : "";
  if (!providerPaymentId) return { handled: false, reason: "event has no payment_id" };

  const payment = await (deps.fetchPayment ?? getPayment)(config, providerPaymentId);
  if (payment.status !== "succeeded") {
    return { handled: false, reason: `payment status is ${payment.status}` };
  }
  const zenoPaymentId =
    typeof payment.metadata?.zeno_payment_id === "string" ? payment.metadata.zeno_payment_id : "";
  if (!zenoPaymentId) return { handled: false, reason: "payment has no zeno_payment_id metadata" };

  const row = await loadPayment(zenoPaymentId);
  if (!row) return { handled: false, reason: "unknown zeno_payment_id" };
  if (payment.currency !== row.currency) {
    return { handled: false, reason: `currency ${payment.currency} != ${row.currency}` };
  }
  // `total_amount` includes any tax, so it may exceed the quote; never less.
  if (!Number.isInteger(payment.total_amount) || payment.total_amount < row.amount_cents) {
    return { handled: false, reason: "paid amount is less than the quoted amount" };
  }
  if (row.checkout_session_id && payment.checkout_session_id &&
      row.checkout_session_id !== payment.checkout_session_id) {
    return { handled: false, reason: "checkout session does not match" };
  }
  if (row.provider_payment_id && row.provider_payment_id !== payment.payment_id) {
    return { handled: false, reason: "payment row is bound to a different provider payment" };
  }

  // created -> paid (idempotent: a redelivery finds it already paid).
  let current: JobPayment = row;
  if (row.status === "created") {
    const updated = await updatePayment(row.id, ["created"], {
      status: "paid",
      provider_payment_id: payment.payment_id,
      paid_at: new Date().toISOString(),
    });
    current = updated ?? (await loadPayment(row.id)) ?? row;
  }

  const treasury =
    deps.treasury === undefined
      ? (() => {
          const built = createTreasuryFunder(env);
          return built.ok ? built.funder : null;
        })()
      : deps.treasury;

  // Mark the job as pending funding (only from unfunded).
  const { data: jobRow, error: jobError } = await getSupabase()
    .from("jobs")
    .update({
      funding_status: "pending",
      funding_wallet_address: treasury ? treasury.address.toLowerCase() : null,
      chain_job_id: chainJobIdFor(current.job_id),
    })
    .eq("id", current.job_id)
    .eq("funding_status", "unfunded")
    .select("id")
    .maybeSingle();
  if (jobError) throw HttpError.internal(`Failed to update job: ${jobError.message}`);
  if (!jobRow) {
    // Not unfunded any more. Continue only if the job is pending *because of
    // this card flow* (a redelivery): its funding wallet is the treasury, or
    // none when no treasury is configured.
    const { data: job } = await getSupabase()
      .from("jobs")
      .select("funding_status, funding_wallet_address")
      .eq("id", current.job_id)
      .maybeSingle();
    const wallet = String(job?.funding_wallet_address ?? "").toLowerCase();
    const pendingViaCard =
      job?.funding_status === "pending" &&
      (treasury ? wallet === treasury.address.toLowerCase() || wallet === "" : wallet === "");
    if (!pendingViaCard) {
      // Funded/pending another way (e.g. the buyer's wallet) after this
      // checkout started: keep the payment as paid and flag it for a refund.
      await getSupabase()
        .from("job_payments")
        .update({ error: `Job funding is ${job?.funding_status ?? "unknown"}; refund this payment` })
        .eq("id", current.id);
      return { handled: true, payment_id: current.id, state: current.status };
    }
  }

  return fundPaidPayment(current.id, { treasury });
}

/** True when a job is pending for this card payment, not the buyer's wallet. */
async function jobAwaitsCardFunding(jobId: string, treasury: TreasuryFunder): Promise<boolean> {
  const { data: job } = await getSupabase()
    .from("jobs")
    .select("funding_status, funding_wallet_address")
    .eq("id", jobId)
    .maybeSingle();
  const wallet = String(job?.funding_wallet_address ?? "").toLowerCase();
  return (
    job?.funding_status === "pending" &&
    (wallet === "" || wallet === treasury.address.toLowerCase())
  );
}

// ---------------------------------------------------------------- funding

/**
 * Fund the escrow for a paid payment from the treasury. Safe to call again:
 * a broadcast funding tx is re-verified, never re-sent.
 */
export async function fundPaidPayment(
  paymentId: string,
  deps: { treasury: TreasuryFunder | null },
): Promise<WebhookOutcome> {
  const row = await loadPayment(paymentId);
  if (!row) throw HttpError.notFound("Payment not found");
  if (row.status === "funded") return { handled: true, payment_id: row.id, state: "funded" };
  if (row.status !== "paid" && row.status !== "funding") {
    return { handled: false, reason: `payment is ${row.status}` };
  }
  if (!deps.treasury) {
    return { handled: true, payment_id: row.id, state: "awaiting_funding" };
  }

  const treasury = deps.treasury;
  const chainJobId = chainJobIdFor(row.job_id);
  const units = toUnits(row.payout_amount);

  // A funding tx was already broadcast: verify it instead of sending again.
  if (row.funding_tx_hash) {
    const result = await treasury.verify(row.funding_tx_hash as Hex, chainJobId, units);
    if (result === null) {
      return { handled: true, payment_id: row.id, state: row.status };
    }
    if (result.ok) {
      await markFunded(row, row.funding_tx_hash, result.amount, treasury.address);
      return { handled: true, payment_id: row.id, state: "funded" };
    }
    // Reverted / mismatched: clear the hash so a later retry may send again.
    await updatePayment(row.id, ["paid", "funding"], {
      status: "paid",
      funding_tx_hash: null,
      error: `Funding tx failed: ${result.reason}`,
    });
    return { handled: true, payment_id: row.id, state: "paid" };
  }

  // Never fund a job that is pending through the buyer's own wallet (or is
  // no longer pending): that could deposit the budget twice.
  if (!(await jobAwaitsCardFunding(row.job_id, treasury))) {
    await updatePayment(row.id, ["paid"], {
      error: "Job is not awaiting card funding; refund this payment",
    });
    return { handled: true, payment_id: row.id, state: row.status };
  }

  const claimed = await updatePayment(row.id, ["paid"], { status: "funding", error: null });
  if (!claimed) return { handled: true, payment_id: row.id, state: row.status };

  try {
    const { txHash, amount } = await treasury.fund(chainJobId, units, async (hash) => {
      await updatePayment(row.id, ["funding"], { funding_tx_hash: hash });
    });
    await markFunded(row, txHash, amount, treasury.address);
    return { handled: true, payment_id: row.id, state: "funded" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.split("\n")[0] : String(cause);
    // Keep any stored hash: the next retry verifies it rather than re-sending.
    await updatePayment(row.id, ["funding"], { status: "paid", error: message });
    return { handled: true, payment_id: row.id, state: "paid" };
  }
}

function toUnits(decimal: string): bigint {
  // payout_amount is NUMERIC(18,6); quoteFunding re-validates the shape.
  return BigInt(quoteFunding(decimal, 0).payout_units);
}

async function markFunded(
  row: JobPayment,
  txHash: string,
  amount: bigint,
  funder: string,
): Promise<void> {
  const now = new Date().toISOString();
  await updatePayment(row.id, ["paid", "funding"], {
    status: "funded",
    funding_tx_hash: txHash,
    funded_at: now,
    error: null,
  });
  const { error } = await getSupabase()
    .from("jobs")
    .update({
      funding_status: "funded",
      funded_amount: fromTokenUnits(amount),
      funding_tx_hash: txHash,
      funded_at: now,
      // The on-chain funder (and JobEscrow buyer) is the treasury.
      funding_wallet_address: funder.toLowerCase(),
    })
    .eq("id", row.job_id)
    .eq("funding_status", "pending");
  if (error) throw HttpError.internal(`Failed to mark job funded: ${error.message}`);
}
