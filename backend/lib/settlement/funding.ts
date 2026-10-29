/**
 * Verify that a funding transaction really funded a given job.
 *
 * The buyer's browser sends `approve` + `fundJob(jobId, amount)` and then
 * posts the tx hash to `/api/jobs/{id}/fund/confirm`. A job becomes `funded`
 * only when the mined receipt succeeded AND it contains a `JobFunded` event
 * emitted by the configured escrow address with:
 *   - `jobId`  == the job's `chain_job_id` (keccak256(utf8(job uuid))),
 *   - `funder` == the job's recorded `funding_wallet_address`,
 *   - `amount` >= the job budget in USDC base units (6 decimals).
 *
 * Only the escrow can emit logs from its own address, so a matching log is
 * proof the contract credited the deposit. Pure and dependency-free so the
 * rule is unit-tested without a network.
 */

import { decodeEventLog, type Address, type Hex, type Log } from "viem";
import { jobEscrowAbi } from "@/lib/settlement/chain";

export interface FundingExpectation {
  escrowAddress: Address;
  chainJobId: Hex;
  funder: Address;
  /** Minimum acceptable deposit, in token base units. */
  minAmount: bigint;
}

export type FundingVerification =
  | { ok: true; amount: bigint; funder: Address }
  | { ok: false; reason: string };

export function verifyJobFunding(
  receipt: { status: "success" | "reverted"; logs: readonly Log[] },
  expected: FundingExpectation,
): FundingVerification {
  if (receipt.status !== "success") {
    return { ok: false, reason: "Transaction failed on-chain" };
  }

  let sawJob = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expected.escrowAddress.toLowerCase()) continue;
    let args: { jobId: Hex; funder: Address; amount: bigint };
    try {
      const decoded = decodeEventLog({
        abi: jobEscrowAbi,
        eventName: "JobFunded",
        data: log.data,
        topics: log.topics,
      });
      args = decoded.args;
    } catch {
      continue; // another escrow event (or not an event we know)
    }
    if (args.jobId.toLowerCase() !== expected.chainJobId.toLowerCase()) continue;
    sawJob = true;

    if (args.funder.toLowerCase() !== expected.funder.toLowerCase()) {
      return { ok: false, reason: "Funding wallet does not match the job's funding wallet" };
    }
    if (args.amount < expected.minAmount) {
      return { ok: false, reason: "Funded amount is less than the job budget" };
    }
    return { ok: true, amount: args.amount, funder: args.funder };
  }

  return {
    ok: false,
    reason: sawJob
      ? "Transaction does not contain a valid JobFunded event"
      : "Transaction does not contain a JobFunded event for this job",
  };
}
