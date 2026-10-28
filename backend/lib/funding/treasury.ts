/**
 * Platform treasury: funds a job's escrow in USDC after a verified card/UPI
 * payment (approve + `fundJob`), then proves it with the same `JobFunded`
 * check the wallet path uses (`lib/settlement/funding.ts`).
 *
 * The treasury key is a THIRD key, separate from the escrow owner and the
 * settlement relayer, and is refused if it appears on the deny-list. It is
 * built only when every setting is present and the chain is allowed; without
 * it, paid jobs wait as "paid, awaiting funding" — no transaction is faked.
 */

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Env } from "@/lib/env";
import { jobEscrowAbi } from "@/lib/settlement/chain";
import { verifyJobFunding } from "@/lib/settlement/funding";
import { chainForId, isAllowedChain, resolveRpcUrl } from "@/lib/settlement/network";
import { COMPROMISED_SETTLEMENT_ADDRESSES, jobEscrowAdminAbi } from "@/lib/settlement/preflight";

export const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type Receipt = { status: "success" | "reverted"; logs: readonly Log[] };

export interface TreasuryDeps {
  address: Address;
  escrowAddress: Address;
  tokenAddress: Address;
  sendTransaction(args: { to: Address; data: Hex }): Promise<Hex>;
  waitForTransactionReceipt(args: { hash: Hex }): Promise<Receipt>;
  getEscrowOwner(): Promise<Address>;
}

export class TreasuryFunder {
  constructor(private readonly deps: TreasuryDeps) {}

  get address(): Address {
    return this.deps.address;
  }

  /**
   * Approve the escrow and fund the job. `onSubmitted` receives the fundJob
   * hash before it is awaited, so a crash can be recovered with `verify`.
   */
  async fund(
    chainJobId: Hex,
    amountUnits: bigint,
    onSubmitted?: (txHash: Hex) => Promise<void> | void,
  ): Promise<{ txHash: Hex; amount: bigint }> {
    const owner = await this.deps.getEscrowOwner();
    if (owner.toLowerCase() === this.deps.address.toLowerCase()) {
      throw new Error("The treasury signer must not be the escrow owner");
    }

    const approveHash = await this.deps.sendTransaction({
      to: this.deps.tokenAddress,
      data: encodeFunctionData({
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [this.deps.escrowAddress, amountUnits],
      }),
    });
    const approval = await this.deps.waitForTransactionReceipt({ hash: approveHash });
    if (approval.status !== "success") throw new Error("USDC approval reverted");

    const txHash = await this.deps.sendTransaction({
      to: this.deps.escrowAddress,
      data: encodeFunctionData({
        abi: jobEscrowAbi,
        functionName: "fundJob",
        args: [chainJobId, amountUnits],
      }),
    });
    await onSubmitted?.(txHash);

    const receipt = await this.deps.waitForTransactionReceipt({ hash: txHash });
    const result = this.check(receipt, chainJobId, amountUnits);
    if (!result.ok) throw new Error(result.reason);
    return { txHash, amount: result.amount };
  }

  /**
   * Re-verify an already-broadcast funding tx (never re-sends). Returns null
   * when the receipt is not available yet.
   */
  async verify(
    txHash: Hex,
    chainJobId: Hex,
    amountUnits: bigint,
  ): Promise<{ ok: true; amount: bigint } | { ok: false; reason: string } | null> {
    let receipt: Receipt;
    try {
      receipt = await this.deps.waitForTransactionReceipt({ hash: txHash });
    } catch {
      return null;
    }
    return this.check(receipt, chainJobId, amountUnits);
  }

  private check(receipt: Receipt, chainJobId: Hex, amountUnits: bigint) {
    const result = verifyJobFunding(receipt, {
      escrowAddress: this.deps.escrowAddress,
      chainJobId,
      funder: this.deps.address,
      minAmount: amountUnits,
    });
    return result.ok
      ? ({ ok: true, amount: result.amount } as const)
      : ({ ok: false, reason: result.reason } as const);
  }
}

export type TreasuryAvailability =
  | { ok: true; funder: TreasuryFunder }
  | { ok: false; reason: string };

/** Build the treasury funder from env, or explain why it is unavailable. */
export function createTreasuryFunder(env: Env): TreasuryAvailability {
  const key = (env.TREASURY_PRIVATE_KEY ?? "").trim();
  const escrow = (env.JOB_ESCROW_ADDRESS ?? "").trim();
  const token = (env.USDC_ADDRESS ?? "").trim();
  const rpcUrl = resolveRpcUrl(env);
  const chain = chainForId(env.CHAIN_ID);

  if (!key) return { ok: false, reason: "TREASURY_PRIVATE_KEY is not configured" };
  if (!escrow || !token || !rpcUrl) {
    return { ok: false, reason: "JOB_ESCROW_ADDRESS, USDC_ADDRESS and RPC_URL must be set" };
  }
  if (!chain || !isAllowedChain(env.CHAIN_ID)) {
    return { ok: false, reason: `Funding is not enabled on chain ${env.CHAIN_ID}` };
  }

  const account = privateKeyToAccount(key as Hex);
  const address = account.address;

  const relayerKey = (env.SETTLEMENT_PRIVATE_KEY ?? "").trim();
  if (relayerKey && privateKeyToAccount(relayerKey as Hex).address.toLowerCase() === address.toLowerCase()) {
    return { ok: false, reason: "The treasury key must differ from the settlement relayer key" };
  }
  const forbidden = new Set(
    [
      ...COMPROMISED_SETTLEMENT_ADDRESSES,
      ...(env.SETTLEMENT_FORBIDDEN_ADDRESS ?? "").split(","),
    ]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (forbidden.has(address.toLowerCase())) {
    return { ok: false, reason: "The treasury address is on the forbidden list" };
  }

  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain, transport });
  const client = createPublicClient({ chain, transport });

  return {
    ok: true,
    funder: new TreasuryFunder({
      address,
      escrowAddress: escrow as Address,
      tokenAddress: token as Address,
      sendTransaction: ({ to, data }) => wallet.sendTransaction({ account, chain, to, data }),
      waitForTransactionReceipt: ({ hash }) =>
        client.waitForTransactionReceipt({ hash, timeout: 60_000 }),
      getEscrowOwner: () =>
        client.readContract({
          address: escrow as Address,
          abi: jobEscrowAdminAbi,
          functionName: "owner",
        }),
    }),
  };
}
