/**
 * Set a user's role. Run with: npx tsx scripts/set-role.ts <email-or-did> <buyer|contributor|reviewer|admin>
 *
 * Uses the service-role key (RLS bypass). Intended for the four real Privy
 * accounts after their first login has created them as `contributor`.
 *
 * Kept dependency-light (createClient + dotenv) so it runs identically under
 * `tsx` and matches scripts/seed.ts.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ROLES = ["buyer", "contributor", "reviewer", "admin"] as const;
type Role = (typeof ROLES)[number];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

async function main() {
  const [, , who, roleArg] = process.argv;

  if (!who || !roleArg) {
    console.error("Usage: npx tsx scripts/set-role.ts <email-or-wallet-or-did> <buyer|contributor|reviewer|admin>");
    process.exit(1);
  }
  if (!isRole(roleArg)) {
    console.error(`Invalid role '${roleArg}'. Must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Match on email, then wallet address (case-insensitive), then Privy DID.
  const isEmail = who.includes("@");
  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(who);

  const query = supabase
    .from("users")
    .select("id, email, privy_did, role");

  const { data: found, error: findError } = isEmail
    ? await query.eq("email", who).maybeSingle()
    : isAddress
      ? await query.ilike("wallet_address", who).maybeSingle()
      : await query.eq("privy_did", who).maybeSingle();
  const column = isEmail ? "email" : isAddress ? "wallet_address" : "privy_did";

  if (findError) {
    console.error(`Lookup failed: ${findError.message}`);
    process.exit(1);
  }
  if (!found) {
    console.error(`No user found with ${column} = ${who}`);
    process.exit(2);
  }

  const previous = found.role as Role;
  const { data: updated, error: updateError } = await supabase
    .from("users")
    .update({ role: roleArg })
    .eq("id", found.id)
    .select("id, email, role")
    .single();

  if (updateError) {
    console.error(`Update failed: ${updateError.message}`);
    process.exit(1);
  }

  console.log(
    `OK  ${updated.email ?? found.privy_did}  ${previous} -> ${updated.role}  (${updated.id})`,
  );
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
