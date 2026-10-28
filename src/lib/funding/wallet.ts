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
