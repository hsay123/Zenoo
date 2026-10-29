/**
 * ROADMAP DEMO (HHG F5) — simulate one data-API purchase of a job's labelled
 * data and split the payment on-chain with `RoyaltySplitter`.
 *
 * Recipients come from real platform data: the data owner is the job's buyer
 * (their wallet), and the contributors are the wallets behind the job's
 * accepted labels, weighted by how many each contributed. The "purchase" is
 * paid by the platform treasury in test USDC on Base Sepolia — there is no
 * real data API and no real customer; the UI and API label it as a demo.
 *
 * Preview needs nothing deployed; a live run needs ROYALTY_SPLITTER_ADDRESS,
 * TREASURY_PRIVATE_KEY and an allowed CHAIN_ID, and is verified by decoding
 * the contract's `SplitPaid` event before it is reported as done.
 */

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { Env } from "@/lib/env";
import {
  chainForId,
  fromTokenUnits,
  isAllowedChain,
  resolveRpcUrl,
  toTokenUnits,
} from "@/lib/settlement/network";
import { erc20ApproveAbi } from "@/lib/funding/treasury";
import { contributorWeights, quoteSplit, DEFAULT_SPLIT_BPS, type LabelRow } from "@/lib/royalty/split";

export const royaltySplitterAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "saleId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "dataOwner", type: "address" },
      { name: "contributors", type: "address[]" },
      { name: "weights", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "SplitPaid",
    inputs: [
      { name: "saleId", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "dataOwner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "zenoShare", type: "uint256", indexed: false },
      { name: "dataOwnerShare", type: "uint256", indexed: false },
      { name: "contributorsShare", type: "uint256", indexed: false },
    ],
  },
] as const;

export interface SalePlan {
  job_id: string;
  amount: string;
  data_owner: string;
  contributors: { wallet: string; accepted_labels: number; share: string }[];
  skipped_without_wallet: number;
  shares: { zeno: string; data_owner: string; contributors: string };
  split_bps: typeof DEFAULT_SPLIT_BPS;
}

/** Data owner + weighted contributors for a job, from real platform data. */
export async function loadSaleRecipients(
  jobId: string,
): Promise<{ dataOwner: string; rows: LabelRow[] }> {
  const supabase = getSupabase();
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, project:projects!inner(buyer:users!inner(wallet_address))")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw HttpError.internal(`Failed to load job: ${jobError.message}`);
  if (!job) throw HttpError.notFound("Job not found");
  const dataOwner = String(
    (job as unknown as { project: { buyer: { wallet_address: string | null } } }).project.buyer
      .wallet_address ?? "",
  );

  // One row per accepted (or paid) non-gold label: its latest submission's author.
  const { data: subs, error: subError } = await supabase
    .from("submissions")
    .select("task_id, version, contributor:users!inner(id, wallet_address), task:tasks!inner(job_id, status, is_gold)")
    .eq("task.job_id", jobId)
    .in("task.status", ["accepted", "paid"])
    .eq("task.is_gold", false)
    .order("version", { ascending: false });
  if (subError) throw HttpError.internal(`Failed to load accepted labels: ${subError.message}`);

  const seen = new Set<string>();
  const rows: LabelRow[] = [];
  for (const raw of subs ?? []) {
    const row = raw as unknown as {
      task_id: string;
      contributor: { id: string; wallet_address: string | null };
    };
    if (seen.has(row.task_id)) continue; // latest version per task only
    seen.add(row.task_id);
    rows.push({ contributor_id: row.contributor.id, wallet_address: row.contributor.wallet_address });
  }
  return { dataOwner, rows };
}

/** Build the split for a sale without sending anything. */
export function planSale(
  jobId: string,
  amount: string,
  dataOwner: string,
  rows: readonly LabelRow[],
): SalePlan {
  if (!/^0x[0-9a-fA-F]{40}$/.test(dataOwner)) {
    throw HttpError.conflict("The job's buyer (data owner) has no payout wallet");
  }
  const { recipients, skippedWithoutWallet } = contributorWeights(rows);
  if (recipients.length === 0) {
    throw HttpError.conflict("This job has no accepted labels from contributors with a payout wallet");
  }
  let units: bigint;
  try {
    units = toTokenUnits(amount);
  } catch {
    throw HttpError.unprocessable("amount must be a positive USDC amount with at most 6 decimals");
  }
  if (units <= BigInt(0)) throw HttpError.unprocessable("amount must be positive");

  const quote = quoteSplit(units, recipients.map((r) => r.weight));
  return {
    job_id: jobId,
    amount: fromTokenUnits(units),
    data_owner: dataOwner.toLowerCase(),
    contributors: recipients.map((r, i) => ({
      wallet: r.wallet,
      accepted_labels: Number(r.weight),
      share: fromTokenUnits(quote.perContributor[i]),
    })),
    skipped_without_wallet: skippedWithoutWallet,
    shares: {
      zeno: fromTokenUnits(quote.zeno),
      data_owner: fromTokenUnits(quote.dataOwner),
      contributors: fromTokenUnits(quote.contributors),
    },
    split_bps: DEFAULT_SPLIT_BPS,
  };
}

/** The decoded `SplitPaid` event for `saleId`, or null. */
export function decodeSplitPaid(logs: readonly Log[], splitter: Address, saleId: Hex) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== splitter.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: royaltySplitterAbi,
        eventName: "SplitPaid",
        data: log.data,
        topics: log.topics,
      });
      if (decoded.args.saleId.toLowerCase() === saleId.toLowerCase()) return decoded.args;
    } catch {
      // another event
    }
  }
  return null;
}

export interface DemoSaleDeps {
  splitter: Address;
  token: Address;
  sendTransaction(args: { to: Address; data: Hex }): Promise<Hex>;
  waitForTransactionReceipt(args: { hash: Hex }): Promise<{ status: "success" | "reverted"; logs: readonly Log[] }>;
}

/** Whether a live run is possible, and why not. */
export function demoSaleDeps(env: Env): { ok: true; deps: DemoSaleDeps } | { ok: false; reason: string } {
  const splitter = (env.ROYALTY_SPLITTER_ADDRESS ?? "").trim();
  const key = (env.TREASURY_PRIVATE_KEY ?? "").trim();
  const token = (env.USDC_ADDRESS ?? "").trim();
  const rpcUrl = resolveRpcUrl(env);
  const chain = chainForId(env.CHAIN_ID);
  if (!splitter) return { ok: false, reason: "RoyaltySplitter is not deployed (ROYALTY_SPLITTER_ADDRESS unset)" };
  if (!key) return { ok: false, reason: "TREASURY_PRIVATE_KEY is not configured" };
  if (!token || !rpcUrl) return { ok: false, reason: "USDC_ADDRESS and RPC_URL must be set" };
  if (!chain || !isAllowedChain(env.CHAIN_ID)) {
    return { ok: false, reason: `Demo payments are not enabled on chain ${env.CHAIN_ID}` };
  }
  const account = privateKeyToAccount(key as Hex);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain, transport });
  const client = createPublicClient({ chain, transport });
  return {
    ok: true,
    deps: {
      splitter: splitter as Address,
      token: token as Address,
      sendTransaction: ({ to, data }) => wallet.sendTransaction({ account, chain, to, data }),
      waitForTransactionReceipt: ({ hash }) =>
        client.waitForTransactionReceipt({ hash, timeout: 60_000 }),
    },
  };
}

/** Pay the planned sale from the treasury and verify the on-chain split. */
export async function runDemoSale(
  plan: SalePlan,
  deps: DemoSaleDeps,
  saleId: Hex = keccak256(stringToHex(`zeno-demo-sale:${plan.job_id}:${Date.now()}`)),
): Promise<{ sale_id: Hex; tx_hash: Hex }> {
  const units = toTokenUnits(plan.amount);

  const approveHash = await deps.sendTransaction({
    to: deps.token,
    data: encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [deps.splitter, units],
    }),
  });
  const approval = await deps.waitForTransactionReceipt({ hash: approveHash });
  if (approval.status !== "success") throw HttpError.internal("USDC approval reverted");

  const txHash = await deps.sendTransaction({
    to: deps.splitter,
    data: encodeFunctionData({
      abi: royaltySplitterAbi,
      functionName: "pay",
      args: [
        saleId,
        units,
        plan.data_owner as Address,
        plan.contributors.map((c) => c.wallet as Address),
        plan.contributors.map((c) => BigInt(c.accepted_labels)),
      ],
    }),
  });
  const receipt = await deps.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw HttpError.internal("Royalty split transaction reverted");

  const event = decodeSplitPaid(receipt.logs, deps.splitter, saleId);
  if (!event || event.amount !== units || event.zenoShare !== toTokenUnits(plan.shares.zeno) ||
      event.dataOwnerShare !== toTokenUnits(plan.shares.data_owner)) {
    throw HttpError.internal("SplitPaid event missing or does not match the planned split");
  }
  return { sale_id: saleId, tx_hash: txHash };
}
