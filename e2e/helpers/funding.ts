/**
 * E2E job funding on Base Sepolia, through the same API a buyer's wallet uses.
 *
 * Since HHG F2 only tasks of a FUNDED job are listed and claimable, so every
 * fixture job is funded for real: record the funding wallet
 * (POST /api/jobs/{id}/fund), send the `approve` and `fund` transactions that
 * GET /api/jobs/{id}/funding prepares, then confirm (POST .../fund/confirm),
 * which verifies the deposit on chain. Test USDC only.
 *
 * The signer is the buyer's local test key (playwright/.auth/wallet-buyer.key,
 * gitignored), the same wallet the captured buyer session logged in with. It
 * needs a little Base Sepolia ETH and test USDC.
 */
import fs from "node:fs";
import path from "node:path";
import { expect } from "playwright/test";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { api } from "./platform";

const BUYER_KEY_FILE = path.resolve("playwright/.auth/wallet-buyer.key");

type TxRequest = { to: Hex; data: Hex };
type Funding = {
  funding_status: string;
  chain: { chain_id: number };
  wallet_tx: { approve: TxRequest; fund: TxRequest; funding_wallet_address: string } | null;
};

// One wallet signs every funding, so transactions must not overlap (specs that
// build fixtures with Promise.all would otherwise reuse a nonce).
let queue: Promise<unknown> = Promise.resolve();

/** Fund a published job's escrow from the buyer's test wallet. */
export function fundJob(buyerToken: string, jobId: string): Promise<string> {
  const run = queue.then(() => fundJobNow(buyerToken, jobId));
  queue = run.catch(() => undefined);
  return run;
}

async function fundJobNow(buyerToken: string, jobId: string): Promise<string> {
  const account = privateKeyToAccount(fs.readFileSync(BUYER_KEY_FILE, "utf8").trim() as Hex);

  const intent = await api(`/api/jobs/${jobId}/fund`, {
    token: buyerToken,
    method: "POST",
    body: { funding_wallet_address: account.address },
  });
  expect(intent.status, intent.text).toBe(200);

  const funding = await api(`/api/jobs/${jobId}/funding`, { token: buyerToken });
  expect(funding.status, funding.text).toBe(200);
  const data = funding.json.data as Funding;
  expect(data.chain.chain_id, "e2e funding runs on Base Sepolia only").toBe(baseSepolia.id);
  const tx = data.wallet_tx;
  expect(tx, "job is not awaiting a wallet funding").toBeTruthy();

  // E2E_RPC_URL overrides the chain's public RPC (sepolia.base.org).
  const transport = http(process.env.E2E_RPC_URL);
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });
  const send = async (request: TxRequest) => {
    const hash = await wallet.sendTransaction({ to: request.to, data: request.data });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status, `tx ${hash}`).toBe("success");
    return hash;
  };

  await send(tx!.approve);
  const fundHash = await send(tx!.fund);

  const confirm = await api(`/api/jobs/${jobId}/fund/confirm`, {
    token: buyerToken,
    method: "POST",
    body: { tx_hash: fundHash },
  });
  expect(confirm.status, confirm.text).toBe(200);
  expect((confirm.json.data as { funding_status: string }).funding_status).toBe("funded");
  return fundHash;
}
