/**
 * Operator CLI: run the fail-closed settlement preflight.
 *
 * Read-only. It inspects the configured settlement RPC (Base Sepolia) and the `JobEscrow`
 * deployment and reports whether real settlement is safe to enable. It never
 * signs or broadcasts a transaction and never prints the signer key.
 *
 * Usage:
 *   npm run settlement:preflight
 *   # or against a candidate deployment without touching .env.local:
 *   JOB_ESCROW_ADDRESS=0x... SETTLEMENT_PRIVATE_KEY=0x... npm run settlement:preflight
 *
 * Exit code 0 when every check passes; 1 otherwise (so CI can gate on it).
 */

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { getEnv } from "../lib/env";
import { runSettlementPreflight } from "../lib/settlement/preflight";

async function main() {
  const report = await runSettlementPreflight(getEnv());

  for (const check of report.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(18)} ${check.detail}`);
  }
  console.log(
    `\nmode=${report.mode} ok=${report.ok} chainId=${report.chainId ?? "-"} ` +
      `escrow=${report.escrow ?? "-"} signer=${report.signer ?? "-"} owner=${report.owner ?? "-"}`,
  );
  console.log(
    report.ok
      ? "\nReal settlement is safe to enable (all checks passed)."
      : "\nReal settlement must stay disabled: MockSettlementService keeps is_mock = true.",
  );

  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
