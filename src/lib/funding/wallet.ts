/**
 * Send a transaction from the buyer's wallet and wait for it to be mined,
 * through the wallet's EIP-1193 provider (Privy embedded or external, e.g.
 * Cake Wallet over WalletConnect). No viem dependency in the frontend: the
 * calldata comes ready-made from GET /api/jobs/{id}/funding.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface TxRequest {
  to: string;
  data: string;
}

export class WalletTxError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Send `tx` and resolve with its hash once a successful receipt exists. */
export async function sendAndWait(
  provider: Eip1193Provider,
  from: string,
  tx: TxRequest,
  opts: { pollMs?: number; timeoutMs?: number; wait?: (ms: number) => Promise<unknown> } = {},
): Promise<string> {
  const pollMs = opts.pollMs ?? 2_000;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const wait = opts.wait ?? sleep;

  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: tx.to, data: tx.data }],
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new WalletTxError("The wallet did not return a transaction hash.");
  }

  for (let waited = 0; waited <= timeoutMs; waited += pollMs) {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    })) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x1") return hash;
      throw new WalletTxError(`Transaction ${hash} reverted on-chain.`);
    }
    await wait(pollMs);
  }
  throw new WalletTxError(`Transaction ${hash} was not confirmed in time; try again shortly.`);
}

export interface WalletBalances {
  /** Token base units (USDC: 6 decimals). */
  tokenUnits: bigint;
  /** Native gas balance in wei. */
  gasWei: bigint;
}

/**
 * Read a wallet's token and gas balances over JSON-RPC, so the funding screen
 * can say "this wallet cannot pay" before asking it to sign anything.
 */
export async function readWalletBalances(
  rpcUrl: string,
  token: string,
  owner: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WalletBalances> {
  const call = async (method: string, params: unknown[]) => {
    const res = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (!res.ok || body.error || typeof body.result !== "string") {
      throw new WalletTxError(body.error?.message ?? `RPC ${method} failed`);
    }
    return BigInt(body.result === "0x" ? "0x0" : body.result);
  };
  // balanceOf(address): selector 0x70a08231 + the address left-padded to 32 bytes.
  const data = `0x70a08231${owner.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const [tokenUnits, gasWei] = await Promise.all([
    call("eth_call", [{ to: token, data }, "latest"]),
    call("eth_getBalance", [owner, "latest"]),
  ]);
  return { tokenUnits, gasWei };
}

/**
 * Gas a wallet needs before we offer wallet funding. Approve + fundJob on Base
 * Sepolia cost about 1.5e12 wei; matches the faucet's GAS_ENOUGH_WEI.
 */
export const MIN_GAS_WEI = BigInt("5000000000000"); // 0.000005 ETH

/** Turn a raw wallet/RPC failure into something a buyer can act on. */
export function friendlyWalletError(cause: unknown): string | null {
  const text = cause instanceof Error ? cause.message : String(cause ?? "");
  // Token shortfall first: its message also says "exceeds balance".
  if (/transfer amount exceeds balance|ERC20InsufficientBalance/i.test(text)) {
    return "Your wallet does not hold enough test USDC for this job. Pay by card instead, or add test USDC and try again.";
  }
  if (/insufficient funds|gas \* price/i.test(text)) {
    return "Your wallet has no Base Sepolia ETH to pay the network fee. Pay by card instead, or add test ETH to the wallet and try again.";
  }
  if (/user rejected|denied|cancel/i.test(text)) return "The wallet request was cancelled.";
  return null;
}

/** "1.25" → 1250000 USDC base units (6 decimals), exactly, without floats. */
export function parseUsdcUnits(input: string): bigint {
  const text = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new WalletTxError("Enter an amount like 1.25 (up to 6 decimals).");
  const [whole, frac = ""] = text.split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(frac.padEnd(6, "0"));
}

/** ERC-20 transfer(to, amount) calldata. */
export function erc20TransferData(to: string, units: bigint): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new WalletTxError("Enter a valid 0x… wallet address.");
  if (units <= BigInt(0)) throw new WalletTxError("Enter an amount above zero.");
  return `0xa9059cbb${to.toLowerCase().slice(2).padStart(64, "0")}${units.toString(16).padStart(64, "0")}`;
}
