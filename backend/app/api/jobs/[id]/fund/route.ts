/**
 * POST /api/jobs/{id}/fund – fund a job's escrow (buyer only).
 *
 * The company must fund the job before tasks become available to contributors.
 * This endpoint records the funding intent and provides the on-chain job ID
 * for the company to send the funding transaction.
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
import { keccak256, stringToHex } from "viem";
import {
  TOKEN_DECIMALS,
  isAllowedChain,
  resolveRpcUrl,
  toTokenUnits,
} from "@/lib/settlement/network";

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
      if (job.funding_status === "pending") {
        throw HttpError.conflict("Job funding is already pending");
      }
      if (job.status !== "published") {
        throw HttpError.conflict("Job must be published before funding");
      }

      // Verify the funding wallet matches the company's wallet
      const { funding_wallet_address } = body as { funding_wallet_address?: string };
      if (!funding_wallet_address) {
        throw HttpError.unprocessable("Funding wallet address is required");
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(funding_wallet_address)) {
        throw HttpError.unprocessable("Invalid wallet address format");
      }

      // Verify the wallet belongs to the company (check against user's wallet)
      if (job.funding_wallet_address && job.funding_wallet_address.toLowerCase() !== funding_wallet_address.toLowerCase()) {
        throw HttpError.conflict("Funding wallet does not match job's funding wallet");
      }

      const env = getEnv();
      const escrowAddress = env.JOB_ESCROW_ADDRESS;
      if (!escrowAddress) {
        throw HttpError.internal("JobEscrow contract not configured");
      }
      if (!env.USDC_ADDRESS) {
        throw HttpError.internal("USDC token address not configured");
      }
      if (!isAllowedChain(env.CHAIN_ID)) {
        throw HttpError.conflict(`Funding is not enabled on chain ${env.CHAIN_ID}`);
      }

      // Exact USDC base units (6 decimals) from the stored decimal budget —
      // never through a JS float.
      let amountUnits: bigint;
      try {
        amountUnits = toTokenUnits(String(job.budget));
      } catch {
        throw HttpError.internal(`Job budget is not a valid USDC amount: ${job.budget}`);
      }

      // Derive the on-chain job ID: keccak256(utf8(job UUID))
      const chainJobId = keccak256(stringToHex(job.id));

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("jobs")
        .update({
          funding_status: "pending",
          funding_wallet_address: funding_wallet_address.toLowerCase(),
          chain_job_id: chainJobId,
        })
        .eq("id", id)
        .eq("funding_status", "unfunded")
        .select("*")
        .maybeSingle();

      if (error) throw HttpError.internal(`Failed to update job funding status: ${error.message}`);
      if (!data) throw HttpError.conflict("Job funding status changed concurrently");

      const updatedJob = toJob(data as JobRow);

      // Return the funding information for the frontend to initiate the
      // transaction: USDC.approve(escrow_address, amount_units), then
      // JobEscrow.fundJob(chain_job_id, amount_units).
      return ok({
        job: updatedJob,
        escrow_address: env.JOB_ESCROW_ADDRESS,
        chain_job_id: chainJobId,
        amount_units: amountUnits.toString(),
        // Deprecated alias of `amount_units`, kept so existing clients keep
        // parsing. Since the USDC migration it is USDC base units, not wei.
        amount_wei: amountUnits.toString(),
        token_address: env.USDC_ADDRESS,
        token_decimals: TOKEN_DECIMALS,
        rpc_url: resolveRpcUrl(env),
        chain_id: env.CHAIN_ID,
      });
    }),
  );
}