/**
 * POST /api/me/gas – testnet only: top up the network-fee balance (Base
 * Sepolia ETH) of one of the caller's own wallets, so a contributor can send
 * the USDC they earned onward (withdraw). Gas only, never USDC; at most a few
 * times a day; see lib/funding/faucet.ts.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireUser } from "@/lib/auth/requireRole";
import { fetchPrivyWallets } from "@/lib/auth/verifyToken";
import { getEnv } from "@/lib/env";
import { consume } from "@/lib/rateLimit";
import { grantTestFunds } from "@/lib/funding/faucet";

export const maxDuration = 30;

const bodySchema = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const { address } = bodySchema.parse(await readJson(req));
      await consume("gas-topup", user.id, { points: 3, duration: 600 });
      const env = getEnv();
      return ok(
        await grantTestFunds(
          env,
          { userId: user.id, address, needUnits: BigInt(0) },
          {
            ownWallets: async () => {
              const wallets = user.privy_did
                ? await fetchPrivyWallets(env.PRIVY_APP_ID ?? "", env.PRIVY_APP_SECRET ?? "", user.privy_did)
                : [];
              return user.wallet_address ? [...wallets, user.wallet_address.toLowerCase()] : wallets;
            },
          },
        ),
      );
    }),
  );
}
