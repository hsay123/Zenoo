/**
 * POST /api/jobs/{id}/fund/confirm – confirm job funding after on-chain transaction.
 *
 * The buyer calls this after the funding transaction (USDC `approve` +
 * `JobEscrow.fundJob`) is confirmed on-chain. The job becomes `funded` only
 * when the mined receipt contains a `JobFunded` event from the configured
 * escrow for THIS job, from the job's funding wallet, for at least the job's
 * budget in USDC base units (see `lib/settlement/funding.ts`).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { loadJobForActor, toJob, type JobRow } from "@/lib/jobs/repository";
import { getSupabase } from "@/lib/db/supabase";
import { getEnv } from "@/lib/env";
import { createPublicClient, http, keccak256, stringToHex, type Address, type Hex } from "viem";
import { verifyJobFunding } from "@/lib/settlement/funding";
import {
  chainForId,
  fromTokenUnits,
  isAllowedChain,
  resolveRpcUrl,
  toTokenUnits,
} from "@/lib/settlement/network";

/** How long to wait for the funding receipt before asking the buyer to retry. */
const RECEIPT_TIMEOUT_MS = 60_000;

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const { id } = await params;
      // The body can be read only once.
      const body = (await readJson(req)) as { tx_hash?: unknown };

      const job = await loadJobForActor(id, user);
      if (job.funding_status === "funded") {
        throw HttpError.conflict("Job is already funded");
      }
      if (job.funding_status !== "pending") {
        throw HttpError.conflict("Job is not in pending funding state");
      }
      if (!job.funding_wallet_address) {
        throw HttpError.conflict("Job has no funding wallet recorded");
      }

      const tx_hash = typeof body.tx_hash === "string" ? body.tx_hash : "";
      if (!/^0x[0-9a-fA-F]{64}$/.test(tx_hash)) {
        throw HttpError.unprocessable("Valid transaction hash is required");
      }

      const env = getEnv();
      const escrowAddress = env.JOB_ESCROW_ADDRESS;
      if (!escrowAddress) {
        throw HttpError.internal("JobEscrow contract not configured");
      }
      const rpcUrl = resolveRpcUrl(env);
      if (!rpcUrl) {
        throw HttpError.internal("RPC_URL not configured");
      }
      const chain = chainForId(env.CHAIN_ID);
      if (!chain || !isAllowedChain(env.CHAIN_ID)) {
        throw HttpError.conflict(`Funding is not enabled on chain ${env.CHAIN_ID}`);
      }

      let minAmount: bigint;
      try {
        minAmount = toTokenUnits(String(job.budget));
      } catch {
        throw HttpError.internal(`Job budget is not a valid USDC amount: ${job.budget}`);
      }

      const client = createPublicClient({ chain, transport: http(rpcUrl) });

      // The RPC must really be the configured chain (never a different network).
      const rpcChainId = await client.getChainId();
      if (rpcChainId !== env.CHAIN_ID) {
        throw HttpError.internal(
          `RPC reports chainId ${rpcChainId} (expected ${env.CHAIN_ID})`,
        );
      }

      let receipt;
      try {
        receipt = await client.waitForTransactionReceipt({
          hash: tx_hash as Hex,
          timeout: RECEIPT_TIMEOUT_MS,
        });
      } catch {
        throw HttpError.unprocessable(
          "Funding transaction receipt not found yet; retry once it is confirmed",
        );
      }

      const verification = verifyJobFunding(receipt, {
        escrowAddress: escrowAddress as Address,
        // Same derivation as POST /fund, which stored it as chain_job_id.
        chainJobId: (job.chain_job_id as Hex | null) ?? keccak256(stringToHex(job.id)),
        funder: job.funding_wallet_address as Address,
        minAmount,
      });
      if (!verification.ok) {
        throw HttpError.unprocessable(verification.reason);
      }

      // Update job status to funded. `funded_amount` is NUMERIC(18,6): store the
      // decimal USDC string, not raw base units.
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("jobs")
        .update({
          funding_status: "funded",
          funded_amount: fromTokenUnits(verification.amount),
          funding_tx_hash: tx_hash,
          funded_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("funding_status", "pending")
        .select("*")
        .maybeSingle();

      if (error) throw HttpError.internal(`Failed to update job funding status: ${error.message}`);
      if (!data) throw HttpError.conflict("Job funding status changed concurrently");

      const updatedJob = toJob(data as JobRow);
      return ok(updatedJob);
    }),
  );
}
