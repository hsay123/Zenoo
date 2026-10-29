/**
 * Funding-confirmation rule tests.
 *
 * A job becomes `funded` only when the receipt succeeded and contains a
 * JobFunded event from the configured escrow, for this job, from the job's
 * funding wallet, for at least the budget in USDC base units.
 */

import { describe, it, expect } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { jobEscrowAbi } from "../chain";
import { verifyJobFunding, type FundingExpectation } from "../funding";
import { toTokenUnits } from "../network";

const ESCROW = "0x000000000000000000000000000000000000dEaD" as Address;
const OTHER_CONTRACT = "0x5555555555555555555555555555555555555555" as Address;
const BUYER = "0x1111111111111111111111111111111111111111" as Address;
const STRANGER = "0x2222222222222222222222222222222222222222" as Address;
const JOB = keccak256(stringToHex("job-uuid-1"));
const OTHER_JOB = keccak256(stringToHex("job-uuid-2"));
const BUDGET = toTokenUnits("2.5"); // 2_500_000

function fundedLog(opts: {
  address?: Address;
  jobId?: Hex;
  funder?: Address;
  amount?: bigint;
}): Log {
  const topics = encodeEventTopics({
    abi: jobEscrowAbi,
    eventName: "JobFunded",
    args: { jobId: opts.jobId ?? JOB, funder: opts.funder ?? BUYER },
  });
  return {
    address: opts.address ?? ESCROW,
    topics,
    data: encodeAbiParameters([{ name: "amount", type: "uint256" }], [opts.amount ?? BUDGET]),
    blockNumber: BigInt(1),
    blockHash: `0x${"00".repeat(32)}`,
    transactionHash: `0x${"ab".repeat(32)}`,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  } as unknown as Log;
}

const expected: FundingExpectation = {
  escrowAddress: ESCROW,
  chainJobId: JOB,
  funder: BUYER,
  minAmount: BUDGET,
};

const ok = (logs: Log[]) => verifyJobFunding({ status: "success", logs }, expected);

describe("verifyJobFunding", () => {
  it("accepts an exact-budget JobFunded event for this job and wallet", () => {
    expect(ok([fundedLog({})])).toEqual({ ok: true, amount: BUDGET, funder: BUYER });
  });

  it("accepts a deposit above the budget", () => {
    const result = ok([fundedLog({ amount: BUDGET + BigInt(1) })]);
    expect(result.ok).toBe(true);
  });

  it("matches the funder case-insensitively", () => {
    const result = verifyJobFunding(
      { status: "success", logs: [fundedLog({})] },
      { ...expected, funder: BUYER.toLowerCase() as Address },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a reverted transaction", () => {
    const result = verifyJobFunding({ status: "reverted", logs: [fundedLog({})] }, expected);
    expect(result).toEqual({ ok: false, reason: "Transaction failed on-chain" });
  });

  it("rejects a deposit below the budget, even by one base unit", () => {
    const result = ok([fundedLog({ amount: BUDGET - BigInt(1) })]);
    expect(result.ok).toBe(false);
  });

  it("rejects an event for a different job (no tx replay across jobs)", () => {
    expect(ok([fundedLog({ jobId: OTHER_JOB })]).ok).toBe(false);
  });

  it("rejects a different funding wallet", () => {
    const result = ok([fundedLog({ funder: STRANGER })]);
    expect(result).toEqual({
      ok: false,
      reason: "Funding wallet does not match the job's funding wallet",
    });
  });

  it("ignores a look-alike event emitted by another contract", () => {
    expect(ok([fundedLog({ address: OTHER_CONTRACT })]).ok).toBe(false);
  });

  it("rejects a receipt with no escrow logs", () => {
    expect(ok([]).ok).toBe(false);
  });

  it("finds the matching event among other logs", () => {
    const result = ok([
      fundedLog({ address: OTHER_CONTRACT }),
      fundedLog({ jobId: OTHER_JOB }),
      fundedLog({}),
    ]);
    expect(result.ok).toBe(true);
  });

  it("reports the event's actual amount, not the expected one", () => {
    // Over-funding passes the minimum, and the route stores what actually
    // arrived (here an absurd 18-decimal-scale number), never the budget.
    const huge = BigInt("2500000000000000000");
    const result = ok([fundedLog({ amount: huge })]);
    expect(result).toEqual({ ok: true, amount: huge, funder: BUYER });
  });
});
