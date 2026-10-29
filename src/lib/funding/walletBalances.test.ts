import { describe, expect, it } from "vitest";
import { MIN_GAS_WEI, friendlyWalletError, readWalletBalances } from "./wallet";

const OWNER = "0x0A65f7d6289E072DBda10e30A23e3e44d005e53B";
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

function rpc(results: Record<string, string>) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { method: string; params: unknown[] };
    calls.push(body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: results[body.method] }));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("readWalletBalances", () => {
  it("reads USDC with balanceOf(owner) and gas with eth_getBalance", async () => {
    const { fetchImpl, calls } = rpc({ eth_call: "0x0f4240", eth_getBalance: "0x0" });
    const b = await readWalletBalances("https://rpc.test", TOKEN, OWNER, fetchImpl);
    expect(b).toEqual({ tokenUnits: BigInt(1_000_000), gasWei: BigInt(0) });
    const call = calls.find((c) => c.method === "eth_call")!;
    expect(call.params[0]).toEqual({
      to: TOKEN,
      data: `0x70a08231000000000000000000000000${OWNER.slice(2).toLowerCase()}`,
    });
  });

  it("treats an empty eth_call result as zero", async () => {
    const { fetchImpl } = rpc({ eth_call: "0x", eth_getBalance: MIN_GAS_WEI.toString(16).replace(/^/, "0x") });
    const b = await readWalletBalances("https://rpc.test", TOKEN, OWNER, fetchImpl);
    expect(b.tokenUnits).toBe(BigInt(0));
    expect(b.gasWei).toBe(MIN_GAS_WEI);
  });
});

describe("friendlyWalletError", () => {
  it("explains the no-gas failure an empty embedded wallet hits", () => {
    const raw = new Error("Transaction creation failed. Details: insufficient funds for gas * price + value: have 0 want 742368000000");
    expect(friendlyWalletError(raw)).toMatch(/no Base Sepolia ETH .* Pay by card/);
  });

  it("explains a USDC shortfall and a cancelled request; leaves others alone", () => {
    expect(friendlyWalletError(new Error("ERC20: transfer amount exceeds balance"))).toMatch(/enough test USDC/);
    expect(friendlyWalletError(new Error("User rejected the request."))).toBe("The wallet request was cancelled.");
    expect(friendlyWalletError(new Error("nonce too low"))).toBeNull();
  });
});
