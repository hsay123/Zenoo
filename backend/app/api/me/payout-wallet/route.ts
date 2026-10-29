/**
 * PUT /api/me/payout-wallet – choose which of the account's own wallets
 * receives payouts (and is used as the account's wallet), e.g. a linked Cake
 * Wallet or MetaMask instead of the embedded one. The address must be one of
 * the Privy user's linked wallets.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { requireUser } from "@/lib/auth/requireRole";
import { fetchPrivyWallets } from "@/lib/auth/verifyToken";
import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";

const bodySchema = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function OPTIONS() {
  return corsOptions();
}

export async function PUT(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const address = bodySchema.parse(await readJson(req)).address.toLowerCase();
      if (!user.privy_did) throw HttpError.conflict("This account has no Privy identity");
      const env = getEnv();
      const own = await fetchPrivyWallets(env.PRIVY_APP_ID ?? "", env.PRIVY_APP_SECRET ?? "", user.privy_did);
      if (!own.includes(address)) {
        throw HttpError.forbidden("Link this wallet to your account first, then choose it for payouts");
      }
      const { error } = await getSupabase().from("users").update({ wallet_address: address }).eq("id", user.id);
      if (error) throw HttpError.internal(`Failed to save the payout wallet: ${error.message}`);
      return ok({ wallet_address: address });
    }),
  );
}
