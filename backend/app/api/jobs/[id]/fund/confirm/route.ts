/**
 * POST /api/jobs/{id}/fund/confirm – confirm job funding after on-chain transaction.
 *
 * The buyer calls this after the funding transaction is confirmed on-chain.
 * This verifies the transaction and updates the job status to funded.
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
import { createPublicClient, http, type Address, type Hex } from "viem";
import { monadTestnet } from "viem/chains";
import { jobEscrowAbi } from "@/lib/settlement/chain";

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
      const body = await readJson(req);

      const job = await loadJobForActor(id, user);
      if (job.funding_status === "funded") {
        throw HttpError.conflict("Job is already funded");
      }
      if (job.funding_status !== "pending") {
        throw HttpError.conflict("Job is not in pending funding state");
      }

      const { tx_hash } = await readJson(req) as { tx_hash: string };
      if (!tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(tx_hash)) {
        throw HttpError.unprocessable("Valid transaction hash is required");
      }

      const env = getEnv();
      const escrowAddress = env.JOB_ESCROW_ADDRESS;
      if (!escrowAddress) {
        throw HttpError.internal("JobEscrow contract not configured");
      }

      const rpcUrl = env.MONAD_RPC_URL;
      if (!rpcUrl) {
        throw HttpError.internal("Monad RPC URL not configured");
      }

      // Verify the transaction on-chain
      const client = createPublicClient({ chain: monadTestnet, transport: http(env.MONAD_RPC_URL) });

      // Get the transaction receipt
      const receipt = await client.waitForTransactionReceipt({ hash: tx_hash as Hex });
      if (receipt.status !== "success") {
        throw HttpError.unprocessable("Transaction failed on-chain");
      }

      // Verify the transaction is a fundJob call to the correct escrow
      const logs = receipt.logs.filter(log => log.address.toLowerCase() === env.JOB_ESCROW_ADDRESS!.toLowerCase());
      let jobFunded = false;
      let fundedAmount = BigInt(0);

      for (const log of logs) {
        try {
          const decoded = await client.readContract({
            address: env.JOB_ESCROW_ADDRESS as `0x${string}`,
            abi: jobEscrowAbi,
            functionName: "jobs",
            args: [log.topics[1]],
          }) as [Address, bigint, bigint, boolean, boolean];
          
          const [buyer, budget, paid, open, exists] = decoded;
          if (exists && budget > BigInt(0)) {
            jobFunded = true;
            fundedAmount = budget;
            break;
          }
        } catch {
          // Not a JobFunded event, continue
        }
      }

      if (!jobFunded) {
        throw HttpError.unprocessable("Transaction does not contain a valid JobFunded event");
      }

      // Update job status to funded
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("jobs")
        .update({
          funding_status: "funded",
          funded_amount: fundedAmount.toString(),
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