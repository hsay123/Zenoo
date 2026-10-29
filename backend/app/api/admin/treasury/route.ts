/**
 * GET /api/admin/treasury – the platform treasury's test-USDC float and gas:
 * what card funding and the testnet faucet can still pay out, with a low
 * warning. Admin only.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { createTreasuryFunder } from "@/lib/funding/treasury";
import { TREASURY_MIN_GAS_WEI } from "@/lib/funding/cardLimits";
import { fromTokenUnits } from "@/lib/settlement/network";

/** Below this the admin screen warns (card jobs and faucet grants draw on it). */
const LOW_USDC_UNITS = BigInt(10_000_000); // 10 test USDC

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      const treasury = createTreasuryFunder(getEnv());
      if (!treasury.ok) {
        return ok({
          configured: false,
          reason: treasury.reason as string | null,
          address: null as string | null,
          usdc: null as string | null,
          gas_wei: null as string | null,
          warnings: [] as string[],
        });
      }
      const capacity = await treasury.funder.capacity();
      const warnings: string[] = [];
      if (!capacity) warnings.push("Treasury balance could not be read");
      else {
        if (capacity.usdcUnits < LOW_USDC_UNITS) warnings.push("Test-USDC float below 10 USDC: card jobs above the float are refused");
        if (capacity.gasWei < TREASURY_MIN_GAS_WEI * BigInt(10)) warnings.push("Gas is low: card funding and faucet grants will stop soon");
      }
      return ok({
        configured: true,
        reason: null as string | null,
        address: treasury.funder.address as string | null,
        usdc: capacity ? fromTokenUnits(capacity.usdcUnits) : null,
        gas_wei: capacity ? capacity.gasWei.toString() : null,
        warnings,
      });
    }),
  );
}
