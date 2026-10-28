import { describe, it, expect } from "vitest";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { jobEscrowAbi } from "@/lib/settlement/chain";
import { TreasuryFunder, createTreasuryFunder, erc20ApproveAbi, type TreasuryDeps } from "../treasury";
import { chainJobIdFor } from "../service";
import type { Env } from "@/lib/env";

const TREASURY = "0x1111111111111111111111111111111111111111" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const ESCROW = "0x000000000000000000000000000000000000dEaD" as Address;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const JOB = chainJobIdFor("job-uuid-1");
const UNITS = BigInt(4_000_000);

function fundedLog(amount: bigint = UNITS, funder: Address = TREASURY): Log {
  return {
    address: ESCROW,
    topics: encodeEventTopics({ abi: jobEscrowAbi, eventName: "JobFunded", args: { jobId: JOB, funder } }),
    data: encodeAbiParameters([{ name: "amount", type: "uint256" }], [amount]),
  } as unknown as Log;
}

function deps(overrides: Partial<TreasuryDeps> = {}, logs: Log[] = [fundedLog()]) {
  const sent: { to: Address; data: Hex }[] = [];
  let n = 0;
  const d: TreasuryDeps = {
    address: TREASURY,
    escrowAddress: ESCROW,
    tokenAddress: USDC,
    sendTransaction: async (tx) => {
      sent.push(tx);
      n += 1;
      return `0x${String(n).padStart(64, "0")}` as Hex;
    },
    waitForTransactionReceipt: async () => ({ status: "success", logs }),
    getEscrowOwner: async () => OWNER,
    ...overrides,
  };
  return { d, sent };
}

describe("TreasuryFunder.fund", () => {
  it("approves the escrow for exactly the payout, then funds this job", async () => {
    const { d, sent } = deps();
    const submitted: Hex[] = [];
    const result = await new TreasuryFunder(d).fund(JOB, UNITS, (h) => {
      submitted.push(h);
    });

    expect(sent).toHaveLength(2);
    expect(sent[0].to).toBe(USDC);
    expect(decodeFunctionData({ abi: erc20ApproveAbi, data: sent[0].data }).args).toEqual([ESCROW, UNITS]);
    expect(sent[1].to).toBe(ESCROW);
    const fund = decodeFunctionData({ abi: jobEscrowAbi, data: sent[1].data });
    expect(fund.functionName).toBe("fundJob");
    expect(fund.args).toEqual([JOB, UNITS]);
    expect(submitted).toEqual([result.txHash]);
    expect(result.amount).toBe(UNITS);
  });

  it("refuses to run when the treasury is the escrow owner", async () => {
    const { d, sent } = deps({ getEscrowOwner: async () => TREASURY });
    await expect(new TreasuryFunder(d).fund(JOB, UNITS)).rejects.toThrow(/escrow owner/);
    expect(sent).toHaveLength(0);
  });

  it("stops after a reverted approval", async () => {
    const { d, sent } = deps({ waitForTransactionReceipt: async () => ({ status: "reverted", logs: [] }) });
    await expect(new TreasuryFunder(d).fund(JOB, UNITS)).rejects.toThrow(/approval reverted/);
    expect(sent).toHaveLength(1);
  });

  it("fails when the funding receipt has no matching JobFunded event", async () => {
    const { d } = deps({}, [fundedLog(UNITS - BigInt(1))]);
    await expect(new TreasuryFunder(d).fund(JOB, UNITS)).rejects.toThrow(/less than the job budget/);
  });
});

describe("TreasuryFunder.verify", () => {
  it("verifies an already-broadcast tx without sending anything", async () => {
    const { d, sent } = deps();
    expect(await new TreasuryFunder(d).verify(`0x${"ab".repeat(32)}`, JOB, UNITS)).toEqual({
      ok: true,
      amount: UNITS,
    });
    expect(sent).toHaveLength(0);
  });

  it("returns null when the receipt is not available yet", async () => {
    const { d } = deps({
      waitForTransactionReceipt: async () => {
        throw new Error("timeout");
      },
    });
    expect(await new TreasuryFunder(d).verify(`0x${"ab".repeat(32)}`, JOB, UNITS)).toBeNull();
  });
});

describe("createTreasuryFunder", () => {
  const TREASURY_KEY = `0x${"22".repeat(32)}`;
  const RELAYER_KEY = `0x${"33".repeat(32)}`;
  const base = {
    TREASURY_PRIVATE_KEY: TREASURY_KEY,
    SETTLEMENT_PRIVATE_KEY: RELAYER_KEY,
    JOB_ESCROW_ADDRESS: ESCROW,
    USDC_ADDRESS: USDC,
    RPC_URL: "https://sepolia.base.org",
    CHAIN_ID: 84532,
    SETTLEMENT_FORBIDDEN_ADDRESS: OWNER,
  } as unknown as Env;

  it("builds a funder when everything is configured on an allowed chain", () => {
    const result = createTreasuryFunder(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.funder.address).toBe(privateKeyToAccount(TREASURY_KEY as Hex).address);
  });

  it("is unavailable without a treasury key", () => {
    expect(createTreasuryFunder({ ...base, TREASURY_PRIVATE_KEY: undefined } as Env).ok).toBe(false);
  });

  it("refuses Base mainnet while it is not allowed", () => {
    expect(createTreasuryFunder({ ...base, CHAIN_ID: 8453 } as Env).ok).toBe(false);
  });

  it("refuses to reuse the settlement relayer key", () => {
    expect(createTreasuryFunder({ ...base, TREASURY_PRIVATE_KEY: RELAYER_KEY } as Env)).toEqual({
      ok: false,
      reason: "The treasury key must differ from the settlement relayer key",
    });
  });

  it("refuses an address on the forbidden list", () => {
    const address = privateKeyToAccount(TREASURY_KEY as Hex).address;
    expect(
      createTreasuryFunder({ ...base, SETTLEMENT_FORBIDDEN_ADDRESS: `${OWNER},${address}` } as Env).ok,
    ).toBe(false);
  });
});
