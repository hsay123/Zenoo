/**
 * GET /api/jobs/{id}/funding – funding summary for the buyer's funding panel
 * (owner buyer or admin).
 *
 * Returns the quote (escrow budget, Zeno fee, buyer total), which payment
 * methods are available, the latest card/UPI payment, a display status, and —
 * when the job is pending a wallet funding — the exact transactions the
 * buyer's wallet must send (USDC.approve, then JobEscrow.fundJob). Read-only.
 */

import type { NextRequest } from "next/server";
import { encodeFunctionData, type Address } from "viem";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { getSupabase } from "@/lib/db/supabase";
import { getEnv } from "@/lib/env";
import { loadJobForActor } from "@/lib/jobs/repository";
import { jobEscrowAbi } from "@/lib/settlement/chain";
import { TOKEN_DECIMALS, isAllowedChain, resolveRpcUrl } from "@/lib/settlement/network";
import { quoteFunding } from "@/lib/funding/pricing";
import { dodoConfig } from "@/lib/funding/dodo";
import { createTreasuryFunder, erc20ApproveAbi } from "@/lib/funding/treasury";
import { chainJobIdFor, loadLatestPayment } from "@/lib/funding/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer", "admin");
      const { id } = await params;
      const job = await loadJobForActor(id, user);
      const env = getEnv();

      const quote = quoteFunding(String(job.budget), env.ZENO_FEE_BPS);

      const { count } = await getSupabase()
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("job_id", job.id)
        .eq("is_gold", false);

      const escrow = (env.JOB_ESCROW_ADDRESS ?? "").trim();
      const token = (env.USDC_ADDRESS ?? "").trim();
      const walletEnabled =
        Boolean(escrow && token && resolveRpcUrl(env)) && isAllowedChain(env.CHAIN_ID);
      const treasury = createTreasuryFunder(env);
      const payment = await loadLatestPayment(job.id);

      const displayStatus =
        job.status === "closed"
          ? "closed"
          : job.funding_status === "funded"
            ? "funded"
            : payment && (payment.status === "paid" || payment.status === "funding")
              ? "paid_awaiting_funding"
              : job.funding_status === "pending"
                ? "pending"
                : "unfunded";

      // Wallet path, after POST /fund recorded the buyer's wallet: the two
      // transactions to send. Card/UPI-funded jobs are funded by the treasury.
      const walletTx =
        walletEnabled &&
        job.funding_status === "pending" &&
        job.funding_wallet_address &&
        !(treasury.ok && job.funding_wallet_address === treasury.funder.address.toLowerCase())
          ? {
              funding_wallet_address: job.funding_wallet_address,
              chain_job_id: chainJobIdFor(job.id),
              amount_units: quote.payout_units,
              approve: {
                to: token,
                data: encodeFunctionData({
                  abi: erc20ApproveAbi,
                  functionName: "approve",
                  args: [escrow as Address, BigInt(quote.payout_units)],
                }),
              },
              fund: {
                to: escrow,
                data: encodeFunctionData({
                  abi: jobEscrowAbi,
                  functionName: "fundJob",
                  args: [chainJobIdFor(job.id), BigInt(quote.payout_units)],
                }),
              },
            }
          : null;

      return ok({
        job_id: job.id,
        funding_status: job.funding_status,
        display_status: displayStatus,
        quote,
        task_count: count ?? 0,
        reward_per_task: job.reward_per_task,
        chain: {
          chain_id: env.CHAIN_ID,
          allowed: isAllowedChain(env.CHAIN_ID),
          escrow_address: escrow || null,
          token_address: token || null,
          token_decimals: TOKEN_DECIMALS,
        },
        methods: {
          wallet: walletEnabled,
          card: dodoConfig(env) !== null,
          // Whether a card payment will be turned into escrow funding
          // automatically, or wait as "paid, awaiting funding".
          card_auto_funding: treasury.ok,
        },
        wallet_tx: walletTx,
        payment: payment
          ? {
              id: payment.id,
              status: payment.status,
              amount_cents: payment.amount_cents,
              currency: payment.currency,
              funding_tx_hash: payment.funding_tx_hash,
              error: payment.error,
              paid_at: payment.paid_at,
              funded_at: payment.funded_at,
            }
          : null,
      });
    }),
  );
}
