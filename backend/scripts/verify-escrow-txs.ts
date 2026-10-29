/**
 * Operator check: run the backend's own verifiers against real escrow txs.
 *
 * Read-only: fetches receipts and reports what the platform would decide —
 * `verifyJobFunding` for a funding tx and `decodeTaskSettled` for a payout tx.
 *
 * Usage (from backend/):
 *   npm run escrow:verify -- fund <txHash> <chainJobId> <funder> <minUnits>
 *   npm run escrow:verify -- settle <txHash>
 */

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { createPublicClient, http, type Address, type Hex } from "viem";
import { getEnv } from "../lib/env";
import { decodeTaskSettled } from "../lib/settlement/chain";
import { verifyJobFunding } from "../lib/settlement/funding";
import { chainForId, resolveRpcUrl } from "../lib/settlement/network";

const json = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);

async function main() {
  const env = getEnv();
  const escrow = env.JOB_ESCROW_ADDRESS as Address | undefined;
  if (!escrow) throw new Error("JOB_ESCROW_ADDRESS is not set");
  const client = createPublicClient({
    chain: chainForId(env.CHAIN_ID) ?? undefined,
    transport: http(resolveRpcUrl(env)),
  });

  const [mode, hash, ...rest] = process.argv.slice(2);
  if (!hash || (mode !== "fund" && mode !== "settle")) {
    throw new Error("Usage: escrow:verify fund <tx> <jobId> <funder> <minUnits> | settle <tx>");
  }
  const receipt = await client.getTransactionReceipt({ hash: hash as Hex });

  if (mode === "fund") {
    const [chainJobId, funder, minUnits] = rest;
    console.log(
      json(
        verifyJobFunding(receipt, {
          escrowAddress: escrow,
          chainJobId: chainJobId as Hex,
          funder: funder as Address,
          minAmount: BigInt(minUnits),
        }),
      ),
    );
  } else {
    console.log(json({ status: receipt.status, event: decodeTaskSettled(receipt.logs, escrow) }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
