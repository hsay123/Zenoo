/**
 * POST /api/jobs/{id}/faucet – testnet only: send the buyer's own wallet
 * ({ address }) the test USDC and gas it still needs to fund this job from
 * that wallet. See lib/funding/faucet.ts for the guardrails.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { HttpError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/requireRole";
import { fetchPrivyWallets } from "@/lib/auth/verifyToken";
import { getEnv } from "@/lib/env";
import { consume } from "@/lib/rateLimit";
import { loadJobForActor } from "@/lib/jobs/repository";
import { quoteFunding } from "@/lib/funding/pricing";
import { grantTestFunds } from "@/lib/funding/faucet";

// Broadcasts two Base Sepolia transfers (does not wait for receipts).
export const maxDuration = 30;

const bodySchema = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireRole(req, "buyer");
      const { id } = await params;
      const job = await loadJobForActor(id, user);
      // Only for a job still waiting to be funded: once its escrow is funded the
      // wallet is empty again, and topping it up would pay the budget twice.
      if (job.status !== "published" || job.funding_status === "funded") {
        throw HttpError.conflict("This job does not need funding");
      }
      const { address } = bodySchema.parse(await readJson(req));
      await consume("faucet", user.id, { points: 3, duration: 600 });
      const env = getEnv();
      const needUnits = BigInt(quoteFunding(String(job.budget), env.ZENO_FEE_BPS).payout_units);
      const result = await grantTestFunds(
        env,
        { userId: user.id, address, needUnits },
        {
          ownWallets: async () => {
            const wallets = user.privy_did
              ? await fetchPrivyWallets(env.PRIVY_APP_ID ?? "", env.PRIVY_APP_SECRET ?? "", user.privy_did)
              : [];
            return user.wallet_address ? [...wallets, user.wallet_address.toLowerCase()] : wallets;
          },
        },
      );
      return ok(result);
    }),
  );
}
