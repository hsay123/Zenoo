/**
 * Real settlement against the USDC `JobEscrow` contract on Base.
 *
 * This service is selected only when `JOB_ESCROW_ADDRESS`, `RPC_URL` (or the
 * deprecated `MONAD_RPC_URL`) and `SETTLEMENT_PRIVATE_KEY` are all present and
 * `CHAIN_ID` is a known Base chain. Otherwise the platform keeps the
 * `MockSettlementService`, and every receipt stays `is_mock = true`.
 *
 * Rewards are decimal USDC strings; they become token base units with
 * `toTokenUnits` (6 decimals), never `parseEther`.
 *
 * A receipt is recorded as real (`is_mock = false`) only after the transaction
 * is mined successfully AND the expected `TaskSettled` event is decoded from
 * the receipt logs with matching job, task, payee, amount and annotation hash.
 * Anything else throws, so no fake hash can ever be recorded as a payout.
 *
 * Contract keys must match the on-chain helpers:
 *   jobId / taskId = keccak256(utf8(<platform uuid>))
 *   settlement key = keccak256(abi.encodePacked(jobId, taskId))
 */

import {
  concat,
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
import { getEnv, type Env } from "@/lib/env";
import { chainForId, resolveRpcUrl, toTokenUnits } from "@/lib/settlement/network";
import { HttpError } from "@/lib/api/errors";
import type {
  SettlementRequest,
  SettlementResult,
  SettlementService,
} from "@/lib/settlement/service";

/** Minimal ABI: the escrow functions and events the backend and buyer UI use. */
export const jobEscrowAbi = [
  {
    type: "function",
    name: "fundJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "JobFunded",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "taskId", type: "bytes32" },
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "annotationHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "TaskSettled",
    inputs: [
      { name: "jobId", type: "bytes32", indexed: true },
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "annotationHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

/** keccak256 of the UTF-8 platform id (matches `cast keccak <uuid>`). */
export function toBytes32Id(id: string): Hex {
  return keccak256(stringToHex(id));
}

/** keccak256(abi.encodePacked(jobId, taskId)); mirrors `JobEscrow._taskKey`. */
export function toTaskKey(jobId: Hex, taskId: Hex): Hex {
  return keccak256(concat([jobId, taskId]));
}

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export interface DecodedSettlement {
  jobId: Hex;
  taskId: Hex;
  payee: Address;
  amount: bigint;
  annotationHash: Hex;
}

/** Find and decode the `TaskSettled` event emitted by the escrow, if present. */
export function decodeTaskSettled(
  logs: readonly Log[],
  escrow: Address,
): DecodedSettlement | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: jobEscrowAbi,
        eventName: "TaskSettled",
        data: log.data,
        topics: log.topics,
      });
      return {
        jobId: decoded.args.jobId,
        taskId: decoded.args.taskId,
        payee: decoded.args.payee,
        amount: decoded.args.amount,
        annotationHash: decoded.args.annotationHash,
      };
    } catch {
      // A log from the same address that is not TaskSettled — keep looking.
    }
  }
  return null;
}

/** The narrow chain surface the service needs, so tests need no network. */
export interface ChainSettlementDeps {
  escrowAddress: Address;
  sendTransaction(args: { to: Address; data: Hex }): Promise<Hex>;
  waitForTransactionReceipt(args: {
    hash: Hex;
  }): Promise<{ status: "success" | "reverted"; logs: readonly Log[] }>;
}

export class ChainSettlementService implements SettlementService {
  constructor(private readonly deps: ChainSettlementDeps) {}

  async settle(req: SettlementRequest): Promise<SettlementResult> {
    const { jobId, taskId, payee, amount } = this.prepare(req);

    const data = encodeFunctionData({
      abi: jobEscrowAbi,
      functionName: "settle",
      args: [jobId, taskId, payee, amount, req.annotationHash as Hex],
    });

    const hash = await this.deps.sendTransaction({
      to: this.deps.escrowAddress,
      data,
    });

    // Persist the hash before waiting, so a lost response is recoverable.
    await req.onSubmitted?.(hash, false);

    const receipt = await this.deps.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw HttpError.internal("Settlement transaction was not mined successfully");
    }
    if (!this.matches(req, receipt.logs)) {
      throw HttpError.internal(
        "Settlement event not found or does not match the requested payout",
      );
    }

    return { tx_hash: hash, is_mock: false };
  }

  /**
   * Re-verify a previously broadcast transaction (crash recovery). Returns the
   * real result only when the receipt is successful and the event matches;
   * otherwise `null`, so an unverified payout is never recorded as real.
   */
  async verify(req: SettlementRequest, txHash: string): Promise<SettlementResult | null> {
    let receipt: { status: "success" | "reverted"; logs: readonly Log[] };
    try {
      receipt = await this.deps.waitForTransactionReceipt({ hash: txHash as Hex });
    } catch {
      return null;
    }
    if (receipt.status !== "success") return null;
    return this.matches(req, receipt.logs) ? { tx_hash: txHash, is_mock: false } : null;
  }

  /** Validate + derive the on-chain arguments, or throw. */
  private prepare(req: SettlementRequest): {
    jobId: Hex;
    taskId: Hex;
    payee: Address;
    amount: bigint;
  } {
    if (!req.payeeAddress) {
      throw HttpError.conflict("Contributor has no wallet address to pay");
    }
    if (!BYTES32_RE.test(req.annotationHash)) {
      throw HttpError.internal("Annotation hash is not a 32-byte hex value");
    }

    let amount: bigint;
    try {
      amount = toTokenUnits(req.amount);
    } catch {
      throw HttpError.internal(`Reward is not a valid USDC amount: ${req.amount}`);
    }

    return {
      jobId: toBytes32Id(req.jobId),
      taskId: toBytes32Id(req.taskId),
      payee: req.payeeAddress as Address,
      amount,
    };
  }

  /** True when the receipt contains a matching `TaskSettled` event. */
  private matches(req: SettlementRequest, logs: readonly Log[]): boolean {
    const event = decodeTaskSettled(logs, this.deps.escrowAddress);
    if (!event) return false;
    const jobId = toBytes32Id(req.jobId);
    const taskId = toBytes32Id(req.taskId);

    let amount: bigint;
    try {
      amount = toTokenUnits(req.amount);
    } catch {
      return false;
    }

    return (
      event.jobId === jobId &&
      event.taskId === taskId &&
      event.payee.toLowerCase() === (req.payeeAddress ?? "").toLowerCase() &&
      event.amount === amount &&
      event.annotationHash === req.annotationHash
    );
  }
}

/**
 * Build the chain service from the environment, or `null` when any of the three
 * required settings is missing/empty or `CHAIN_ID` is not a known Base chain
 * (mock stays in effect). Whether the chain is *allowed* is the preflight's job.
 */
export function createChainSettlementService(
  env: Env = getEnv(),
): ChainSettlementService | null {
  const { JOB_ESCROW_ADDRESS, SETTLEMENT_PRIVATE_KEY } = env;
  const rpcUrl = resolveRpcUrl(env);
  const chain = chainForId(env.CHAIN_ID);
  if (!JOB_ESCROW_ADDRESS || !rpcUrl || !SETTLEMENT_PRIVATE_KEY || !chain) {
    return null;
  }

  const account = privateKeyToAccount(SETTLEMENT_PRIVATE_KEY as Hex);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  return new ChainSettlementService({
    escrowAddress: JOB_ESCROW_ADDRESS as Address,
    sendTransaction: ({ to, data }) =>
      wallet.sendTransaction({ account, chain, to, data }),
    waitForTransactionReceipt: ({ hash }) => publicClient.waitForTransactionReceipt({ hash }),
  });
}
