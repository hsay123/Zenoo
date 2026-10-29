/**
 * POST /api/me/sync – re-read the account's email and wallet from Privy after
 * the user links one (Privy linkEmail / linkWallet). Fills a missing email,
 * and a missing wallet with the first linked one. Never overwrites a payout
 * wallet the user chose (that is PUT /api/me/payout-wallet).
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/requireRole";
import { fetchPrivyProfile, fetchPrivyWallets } from "@/lib/auth/verifyToken";
import { getEnv } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      if (!user.privy_did) throw HttpError.conflict("This account has no Privy identity to sync");
      const env = getEnv();
      const [profile, wallets] = await Promise.all([
        fetchPrivyProfile(env.PRIVY_APP_ID ?? "", env.PRIVY_APP_SECRET ?? "", user.privy_did),
        fetchPrivyWallets(env.PRIVY_APP_ID ?? "", env.PRIVY_APP_SECRET ?? "", user.privy_did),
      ]);
      const update: Record<string, string> = {};
      if (!user.email && profile.email) update.email = profile.email;
      if (!user.wallet_address && wallets[0]) update.wallet_address = wallets[0];
      if (Object.keys(update).length) {
        const { error } = await getSupabase().from("users").update(update).eq("id", user.id);
        if (error) throw HttpError.internal(`Failed to update the account: ${error.message}`);
      }
      return ok({
        email: update.email ?? user.email,
        wallet_address: update.wallet_address ?? user.wallet_address,
        linked_wallets: wallets,
      });
    }),
  );
}
