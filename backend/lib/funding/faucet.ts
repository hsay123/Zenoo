/**
 * Testnet faucet (Base Sepolia only): sends a buyer's own wallet just enough
 * test USDC and gas to fund a job from that wallet. Email sign-ups get an
 * embedded Privy wallet that starts empty, so without this the wallet path is
 * a dead end.
 *
 * Guardrails: chain 84532 only; the address must be one of the account's own
 * Privy wallets (never taken on trust from the browser); at most what the job
 * still needs, capped per grant and per account per day; every grant is
 * recorded with its transaction hashes. Source: the treasury's test float.
 * Returns once the transfers are broadcast; the caller polls for the balance.
 */

import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Env } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import { chainForId, resolveRpcUrl } from "@/lib/settlement/network";
import { createTreasuryFunder } from "@/lib/funding/treasury";

export const FAUCET_CHAIN_ID = 84532; // Base Sepolia; never a mainnet
export const MAX_USDC_PER_GRANT = BigInt(2_000_000); // 2 test USDC
export const MAX_USDC_PER_DAY = BigInt(5_000_000); // 5 test USDC per account
/** Approve + fundJob cost about 1.5e12 wei on Base Sepolia; this covers several. */
export const GAS_GRANT_WEI = BigInt("10000000000000"); // 0.00001 ETH
export const GAS_ENOUGH_WEI = BigInt("5000000000000"); // 0.000005 ETH
export const MAX_GAS_GRANTS_PER_DAY = 3;

export interface GrantPlan {
  usdcUnits: bigint;
  gasWei: bigint;
}

/** What to send: only what is missing for this job, within the caps. */
export function planGrant(input: {
  needUnits: bigint;
  balanceUnits: bigint;
  gasWei: bigint;
  grantedTodayUnits: bigint;
}): GrantPlan {
  const missing = input.needUnits > input.balanceUnits ? input.needUnits - input.balanceUnits : BigInt(0);
  const leftToday = MAX_USDC_PER_DAY > input.grantedTodayUnits ? MAX_USDC_PER_DAY - input.grantedTodayUnits : BigInt(0);
  let usdcUnits = missing;
  if (usdcUnits > MAX_USDC_PER_GRANT) usdcUnits = MAX_USDC_PER_GRANT;
  if (usdcUnits > leftToday) usdcUnits = leftToday;
  return { usdcUnits, gasWei: input.gasWei < GAS_ENOUGH_WEI ? GAS_GRANT_WEI : BigInt(0) };
}

export interface FaucetDeps {
  /** The account's own wallet addresses (lowercase). */
  ownWallets: () => Promise<string[]>;
  now?: () => Date;
}

export async function grantTestFunds(
  env: Env,
  input: { userId: string; address: string; needUnits: bigint },
  deps: FaucetDeps,
) {
  if (env.CHAIN_ID !== FAUCET_CHAIN_ID) throw HttpError.forbidden("The test faucet runs on Base Sepolia only");
  const address = input.address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw HttpError.unprocessable("Invalid wallet address");
  const own = await deps.ownWallets();
  if (!own.includes(address)) throw HttpError.forbidden("That wallet does not belong to your account");

  const treasury = createTreasuryFunder(env);
  const chain = chainForId(env.CHAIN_ID);
  const rpcUrl = resolveRpcUrl(env);
  const token = (env.USDC_ADDRESS ?? "").trim() as Address;
  if (!treasury.ok || !chain || !rpcUrl || !token) throw HttpError.conflict("The test faucet is not configured");

  const transport = http(rpcUrl);
  const client = createPublicClient({ chain, transport });
  const [balanceUnits, gasWei] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address as Address] }),
    client.getBalance({ address: address as Address }),
  ]);

  const since = new Date((deps.now?.() ?? new Date()).getTime() - 24 * 3600 * 1000).toISOString();
  const { data: grants, error } = await getSupabase()
    .from("faucet_grants")
    .select("usdc_units, gas_wei")
    .eq("user_id", input.userId)
    .gte("created_at", since);
  if (error) throw HttpError.internal(`Failed to read faucet grants: ${error.message}`);
  const grantedTodayUnits = (grants ?? []).reduce((sum, g) => sum + BigInt(g.usdc_units as number), BigInt(0));
  const gasGrantsToday = (grants ?? []).filter((g) => BigInt(String(g.gas_wei)) > BigInt(0)).length;

  const plan = planGrant({ needUnits: input.needUnits, balanceUnits, gasWei, grantedTodayUnits });
  if (plan.gasWei > BigInt(0) && gasGrantsToday >= MAX_GAS_GRANTS_PER_DAY) {
    if (plan.usdcUnits === BigInt(0)) {
      throw HttpError.rateLimit("You have used today's free network-fee top-ups. Try again tomorrow.");
    }
    plan.gasWei = BigInt(0);
  }
  const missing = input.needUnits > balanceUnits;
  if (missing && plan.usdcUnits === BigInt(0)) {
    throw HttpError.rateLimit("You have used today's test-USDC allowance (5 USDC). Pay by card, or try tomorrow.");
  }
  if (plan.usdcUnits === BigInt(0) && plan.gasWei === BigInt(0)) {
    return { usdc_units: "0", gas_wei: "0", usdc_tx_hash: null, gas_tx_hash: null, already_funded: true };
  }

  const key = (env.TREASURY_PRIVATE_KEY ?? "").trim() as Hex;
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain, transport });
  let usdcTx: Hex | null = null;
  let gasTx: Hex | null = null;
  try {
    if (plan.usdcUnits > BigInt(0)) {
      usdcTx = await wallet.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [address as Address, plan.usdcUnits],
        account,
        chain,
      });
    }
    if (plan.gasWei > BigInt(0)) {
      gasTx = await wallet.sendTransaction({ to: address as Address, value: plan.gasWei, account, chain });
    }
  } catch (error) {
    console.error("[faucet] broadcast failed", error instanceof Error ? error.message.slice(0, 200) : error);
    if (!usdcTx && !gasTx) {
      throw HttpError.conflict("Could not send test funds right now (network busy). Try again in a few seconds.");
    }
    // One transfer went out: record it below so the caps still count it.
  }
  // Record before waiting, so a slow receipt never lets the caps be bypassed.
  await getSupabase().from("faucet_grants").insert({
    user_id: input.userId,
    address,
    usdc_units: Number(plan.usdcUnits),
    gas_wei: plan.gasWei.toString(),
    usdc_tx_hash: usdcTx,
    gas_tx_hash: gasTx,
  });
  // Answer as soon as both are broadcast: the screen polls the wallet's
  // balance until they confirm, instead of holding a request open on chain.
  return {
    usdc_units: plan.usdcUnits.toString(),
    gas_wei: plan.gasWei.toString(),
    usdc_tx_hash: usdcTx,
    gas_tx_hash: gasTx,
    already_funded: false,
  };
}
