import { describe, expect, it } from "vitest";
import { sendAndWait, WalletTxError, type Eip1193Provider } from "./wallet";

const HASH = `0x${"ab".repeat(32)}`;
const TX = { to: "0x000000000000000000000000000000000000dEaD", data: "0x1234" };
const noWait = async () => undefined;

function provider(receipts: unknown[], hash: unknown = HASH) {
  const calls: { method: string; params?: unknown[] }[] = [];
  const p: Eip1193Provider = {
    request: async (args) => {
      calls.push(args);
      if (args.method === "eth_sendTransaction") return hash;
      return receipts.shift() ?? null;
    },
  };
  return { p, calls };
}

describe("sendAndWait", () => {
  it("sends from the buyer's address and resolves once the receipt succeeds", async () => {
    const { p, calls } = provider([null, null, { status: "0x1" }]);
    await expect(sendAndWait(p, "0xbuyer", TX, { wait: noWait })).resolves.toBe(HASH);
    expect(calls[0]).toEqual({
      method: "eth_sendTransaction",
      params: [{ from: "0xbuyer", to: TX.to, data: TX.data }],
    });
    expect(calls.filter((c) => c.method === "eth_getTransactionReceipt")).toHaveLength(3);
  });

  it("throws when the transaction reverted", async () => {
    const { p } = provider([{ status: "0x0" }]);
    await expect(sendAndWait(p, "0xbuyer", TX, { wait: noWait })).rejects.toBeInstanceOf(WalletTxError);
  });

  it("throws when the wallet returns no hash", async () => {
    const { p } = provider([], null);
    await expect(sendAndWait(p, "0xbuyer", TX, { wait: noWait })).rejects.toThrow(/hash/);
  });

  it("gives up after the timeout instead of waiting forever", async () => {
    const { p } = provider([]);
    await expect(
      sendAndWait(p, "0xbuyer", TX, { wait: noWait, pollMs: 10, timeoutMs: 30 }),
    ).rejects.toThrow(/not confirmed in time/);
  });
});
