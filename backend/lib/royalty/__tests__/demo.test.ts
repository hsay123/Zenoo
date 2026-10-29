import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { planSale, royaltySplitterAbi, runDemoSale, type DemoSaleDeps } from "../demo";

const OWNER = "0x1111111111111111111111111111111111111111";
const C1 = "0x2222222222222222222222222222222222222222";
const C2 = "0x3333333333333333333333333333333333333333";
const SPLITTER = "0x000000000000000000000000000000000000dEaD" as Address;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const SALE = `0x${"ab".repeat(32)}` as Hex;

const rows = [
  { contributor_id: "a", wallet_address: C1 },
  { contributor_id: "a", wallet_address: C1 },
  { contributor_id: "a", wallet_address: C1 },
  { contributor_id: "b", wallet_address: C2 },
  { contributor_id: "c", wallet_address: null },
];

describe("planSale", () => {
  it("plans a 50/30/20 split weighted by accepted labels", () => {
    const plan = planSale("job-1", "4", OWNER, rows);
    expect(plan.shares).toEqual({ zeno: "2", data_owner: "1.2", contributors: "0.8" });
    expect(plan.contributors).toEqual([
      { wallet: C1, accepted_labels: 3, share: "0.6" },
      { wallet: C2, accepted_labels: 1, share: "0.2" },
    ]);
    expect(plan.skipped_without_wallet).toBe(1);
  });

  it("refuses a data owner without a wallet, no eligible contributors, and bad amounts", () => {
    expect(() => planSale("j", "1", "", rows)).toThrow(/data owner/);
    expect(() => planSale("j", "1", OWNER, [])).toThrow(/no accepted labels/);
    expect(() => planSale("j", "1e3", OWNER, rows)).toThrow(/USDC amount/);
    expect(() => planSale("j", "0", OWNER, rows)).toThrow();
  });
});

function splitLog(amount: bigint, zeno: bigint, owner: bigint, contributors: bigint): Log {
  return {
    address: SPLITTER,
    topics: encodeEventTopics({
      abi: royaltySplitterAbi,
      eventName: "SplitPaid",
      args: { saleId: SALE, payer: OWNER as Address, dataOwner: OWNER as Address },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [amount, zeno, owner, contributors],
    ),
  } as unknown as Log;
}

function deps(log: Log, status: "success" | "reverted" = "success") {
  const sent: { to: Address; data: Hex }[] = [];
  const d: DemoSaleDeps = {
    splitter: SPLITTER,
    token: USDC,
    sendTransaction: async (tx) => {
      sent.push(tx);
      return `0x${String(sent.length).padStart(64, "0")}` as Hex;
    },
    waitForTransactionReceipt: async () => ({ status, logs: [log] }),
  };
  return { d, sent };
}

describe("runDemoSale", () => {
  const plan = planSale("job-1", "4", OWNER, rows);

  it("approves the splitter, pays with weights, and verifies SplitPaid", async () => {
    const { d, sent } = deps(splitLog(BigInt(4_000_000), BigInt(2_000_000), BigInt(1_200_000), BigInt(800_000)));
    const result = await runDemoSale(plan, d, SALE);
    expect(result.sale_id).toBe(SALE);
    expect(sent[0].to).toBe(USDC);
    const pay = decodeFunctionData({ abi: royaltySplitterAbi, data: sent[1].data });
    expect(pay.args).toEqual([SALE, BigInt(4_000_000), OWNER, [C1, C2], [BigInt(3), BigInt(1)]]);
  });

  it("fails when the on-chain split does not match the plan", async () => {
    const { d } = deps(splitLog(BigInt(4_000_000), BigInt(1), BigInt(1_200_000), BigInt(800_000)));
    await expect(runDemoSale(plan, d, SALE)).rejects.toThrow(/does not match/);
  });

  it("fails when a transaction reverts", async () => {
    const { d } = deps(splitLog(BigInt(0), BigInt(0), BigInt(0), BigInt(0)), "reverted");
    await expect(runDemoSale(plan, d, SALE)).rejects.toThrow(/reverted/);
  });
});
