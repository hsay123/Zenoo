/**
 * ChainSettlementService tests.
 *
 * These exercise the "real means real" contract:
 *   - is_mock = false is returned only for a *successful* receipt whose decoded
 *     TaskSettled event matches the requested payout exactly;
 *   - every other outcome throws, so no fabricated hash reaches a receipt.
 */

import { describe, it, expect } from "vitest";
import {
  concat,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type Log,
} from "viem";
import {
  ChainSettlementService,
  createChainSettlementService,
  decodeTaskSettled,
  jobEscrowAbi,
  toBytes32Id,
  toTaskKey,
} from "../chain";
import type { Env } from "@/lib/env";

const ESCROW = "0x000000000000000000000000000000000000dEaD" as Address;
const PAYEE = "0x1111111111111111111111111111111111111111" as Address;
const OTHER = "0x2222222222222222222222222222222222222222" as Address;
const TX_HASH = `0x${"ab".repeat(32)}` as Hex;
const ANNOTATION_HASH = `0x${"cd".repeat(32)}` as Hex;
const OTHER_HASH = `0x${"ef".repeat(32)}` as Hex;

const JOB_ID = "job-1";
const TASK_ID = "task-1";
const JOB_B32 = toBytes32Id(JOB_ID);
const TASK_B32 = toBytes32Id(TASK_ID);
const AMOUNT = BigInt(250000); // 0.25 USDC (6 decimals)

function settledLog(opts: {
  jobId?: Hex;
  taskId?: Hex;
  payee?: Address;
  amount?: bigint;
  annotationHash?: Hex;
}): Log {
  const topics = encodeEventTopics({
    abi: jobEscrowAbi,
    eventName: "TaskSettled",
    args: {
      jobId: opts.jobId ?? JOB_B32,
      taskId: opts.taskId ?? TASK_B32,
      payee: opts.payee ?? PAYEE,
    },
  });
  const data = encodeAbiParameters(
    [
      { name: "amount", type: "uint256" },
      { name: "annotationHash", type: "bytes32" },
    ],
    [opts.amount ?? AMOUNT, opts.annotationHash ?? ANNOTATION_HASH],
  );
  return {
    address: ESCROW,
    topics,
    data,
    blockNumber: BigInt(1),
    blockHash: `0x${"00".repeat(32)}`,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  } as unknown as Log;
}

function request(overrides: Partial<Parameters<ChainSettlementService["settle"]>[0]> = {}) {
  return {
    jobId: JOB_ID,
    taskId: TASK_ID,
    submissionId: "sub-1",
    annotationHash: ANNOTATION_HASH,
    policyHash: "0xpolicy",
    amount: "0.25",
    payeeAddress: PAYEE,
    ...overrides,
  };
}

function serviceFor(logs: readonly Log[], status: "success" | "reverted" = "success") {
  return new ChainSettlementService({
    escrowAddress: ESCROW,
    sendTransaction: async () => TX_HASH,
    waitForTransactionReceipt: async () => ({ status, logs }),
  });
}

describe("key derivation", () => {
  it("toBytes32Id is keccak256(utf8(id))", () => {
    expect(toBytes32Id(JOB_ID)).toBe(keccak256(stringToHex(JOB_ID)));
    expect(toBytes32Id(JOB_ID)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("toTaskKey is keccak256(abi.encodePacked(jobId, taskId))", () => {
    expect(toTaskKey(JOB_B32, TASK_B32)).toBe(keccak256(concat([JOB_B32, TASK_B32])));
  });
});

describe("decodeTaskSettled", () => {
  it("decodes the escrow event and ignores foreign logs", () => {
    const foreign = { ...settledLog({}), address: OTHER } as Log;
    expect(decodeTaskSettled([foreign], ESCROW)).toBeNull();
    expect(decodeTaskSettled([foreign, settledLog({})], ESCROW)?.payee).toBe(PAYEE);
  });
});

describe("ChainSettlementService.settle", () => {
  it("returns the real hash and is_mock=false for a matching success", async () => {
    const result = await serviceFor([settledLog({})]).settle(request());
    expect(result).toEqual({ tx_hash: TX_HASH, is_mock: false });
  });

  it("throws when the transaction reverted", async () => {
    await expect(serviceFor([settledLog({})], "reverted").settle(request())).rejects.toThrow(
      /not mined successfully/i,
    );
  });

  it("throws when the expected event is missing", async () => {
    await expect(serviceFor([]).settle(request())).rejects.toThrow(/event not found/i);
  });

  it("throws when the event payee does not match", async () => {
    await expect(
      serviceFor([settledLog({ payee: OTHER })]).settle(request()),
    ).rejects.toThrow(/does not match/i);
  });

  it("throws when the event amount does not match", async () => {
    await expect(
      serviceFor([settledLog({ amount: BigInt(1) })]).settle(request()),
    ).rejects.toThrow(/does not match/i);
  });

  it("throws when the event annotation hash does not match", async () => {
    await expect(
      serviceFor([settledLog({ annotationHash: OTHER_HASH })]).settle(request()),
    ).rejects.toThrow(/does not match/i);
  });

  it("refuses to settle without a payout address", async () => {
    await expect(serviceFor([settledLog({})]).settle(request({ payeeAddress: null }))).rejects.toThrow(
      /no wallet address/i,
    );
  });

  it("refuses a malformed annotation hash", async () => {
    await expect(
      serviceFor([settledLog({})]).settle(request({ annotationHash: "0xnothex" })),
    ).rejects.toThrow(/32-byte hex/i);
  });

  it("refuses a non-numeric reward", async () => {
    await expect(serviceFor([settledLog({})]).settle(request({ amount: "lots" }))).rejects.toThrow(
      /valid USDC amount/i,
    );
  });

  it("refuses a reward with more than 6 decimal places", async () => {
    await expect(
      serviceFor([settledLog({})]).settle(request({ amount: "0.0000001" })),
    ).rejects.toThrow(/valid USDC amount/i);
  });

  it("refuses exponent notation instead of guessing its value", async () => {
    await expect(serviceFor([settledLog({})]).settle(request({ amount: "1e-6" }))).rejects.toThrow(
      /valid USDC amount/i,
    );
  });

  it("rejects an event carrying the old 18-decimal (wei) amount", async () => {
    // 0.25 * 10^18 is what parseEther produced before the USDC migration; a
    // payout recorded with it would be a 10^12x mismatch.
    await expect(
      serviceFor([settledLog({ amount: BigInt("250000000000000000") })]).settle(request()),
    ).rejects.toThrow(/does not match/i);
  });

  it("encodes the reward as 6-decimal USDC base units in settle()", async () => {
    let sent: Hex | null = null;
    const service = new ChainSettlementService({
      escrowAddress: ESCROW,
      sendTransaction: async ({ data }) => {
        sent = data;
        return TX_HASH;
      },
      waitForTransactionReceipt: async () => ({
        status: "success",
        logs: [settledLog({ amount: BigInt(40000) })],
      }),
    });
    await service.settle(request({ amount: "0.04" }));
    const decoded = decodeFunctionData({ abi: jobEscrowAbi, data: sent! });
    expect(decoded.functionName).toBe("settle");
    expect(decoded.args?.[3]).toBe(BigInt(40000));
  });
});

describe("ChainSettlementService.onSubmitted", () => {
  it("reports the broadcast hash as real before confirmation", async () => {
    const seen: Array<[string, boolean]> = [];
    await serviceFor([settledLog({})]).settle(
      request({
        onSubmitted: (hash, isMock) => {
          seen.push([hash, isMock]);
        },
      }),
    );
    expect(seen).toEqual([[TX_HASH, false]]);
  });
});

describe("ChainSettlementService.verify", () => {
  it("returns the real result for a matching successful tx", async () => {
    const service = serviceFor([settledLog({})]);
    expect(await service.verify(request(), TX_HASH)).toEqual({
      tx_hash: TX_HASH,
      is_mock: false,
    });
  });

  it("returns null for a reverted tx", async () => {
    const service = serviceFor([settledLog({})], "reverted");
    expect(await service.verify(request(), TX_HASH)).toBeNull();
  });

  it("returns null when the decoded event does not match", async () => {
    const service = serviceFor([settledLog({ payee: OTHER })]);
    expect(await service.verify(request(), TX_HASH)).toBeNull();
  });

  it("returns null when the receipt cannot be fetched", async () => {
    const service = new ChainSettlementService({
      escrowAddress: ESCROW,
      sendTransaction: async () => TX_HASH,
      waitForTransactionReceipt: async () => {
        throw new Error("tx not found");
      },
    });
    expect(await service.verify(request(), TX_HASH)).toBeNull();
  });
});

describe("createChainSettlementService", () => {
  const baseEnv = {
    JOB_ESCROW_ADDRESS: ESCROW,
    CHAIN_ID: 84532,
    RPC_URL: "https://sepolia.base.org",
    SETTLEMENT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  };

  it("returns null when the relayer key is absent", () => {
    expect(
      createChainSettlementService({ ...baseEnv, SETTLEMENT_PRIVATE_KEY: "" } as Env),
    ).toBeNull();
  });

  it("returns null when the escrow address is empty", () => {
    expect(createChainSettlementService({ ...baseEnv, JOB_ESCROW_ADDRESS: "" } as Env)).toBeNull();
  });

  it("builds a service when all three settings are present", () => {
    const service = createChainSettlementService(baseEnv as unknown as Env);
    expect(service).toBeInstanceOf(ChainSettlementService);
  });

  it("returns null when CHAIN_ID is not a known Base chain", () => {
    expect(
      createChainSettlementService({ ...baseEnv, CHAIN_ID: 10143 } as unknown as Env),
    ).toBeNull();
  });

  it("still accepts the deprecated MONAD_RPC_URL alias when RPC_URL is unset", () => {
    const { RPC_URL: _unused, ...rest } = baseEnv;
    void _unused;
    const service = createChainSettlementService({
      ...rest,
      MONAD_RPC_URL: "https://sepolia.base.org",
    } as unknown as Env);
    expect(service).toBeInstanceOf(ChainSettlementService);
  });
});
