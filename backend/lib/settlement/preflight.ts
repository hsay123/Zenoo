/**
 * Fail-closed settlement preflight.
 *
 * Real (on-chain) settlement is only ever safe when the backend signer is a
 * fresh, allow-listed relayer on a verified `JobEscrow` deployment whose owner
 * is a *different* address and whose chain is Monad testnet (10143). This module
 * answers that question without moving any money: it reads the RPC and the
 * contract and reports every check that must pass before
 * `JOB_ESCROW_ADDRESS` / `MONAD_RPC_URL` / `SETTLEMENT_PRIVATE_KEY` are set.
 *
 * The rule is fail-closed: `ok` is true only when settlement is configured AND
 * every check passes. Any missing/failed check leaves the platform on
 * `MockSettlementService` with `is_mock = true`.
 *
 * It is intentionally read-only and dependency-injected so the checks can be
 * unit-tested without a network or a real key.
 */

import {
  createPublicClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { Env } from "@/lib/env";

/** Monad testnet — the only chain settlement is allowed to run on. */
export const MONAD_TESTNET_CHAIN_ID = 10143;

/**
 * Settlement ABI revision the backend requires of the deployed escrow. The
 * hardened `JobEscrow` reports it via `SETTLEMENT_ABI_VERSION()`. Any other
 * value (including a revert from a pre-hardening contract) fails closed, so a
 * stale deployment can never receive real payouts even if it happens to expose
 * `owner()`/`relayers()`.
 */
export const SETTLEMENT_ABI_VERSION_EXPECTED = BigInt(2);

/**
 * Addresses that must never act as the settlement signer or the escrow owner,
 * *regardless* of environment configuration. The entry below is the key exposed
 * in a screenshot alongside the legacy single-role escrow. It is enforced in
 * code so blanking, clearing, or mis-setting `SETTLEMENT_FORBIDDEN_ADDRESS` can
 * never re-enable a known-compromised address.
 */
export const COMPROMISED_SETTLEMENT_ADDRESSES: readonly string[] = [
  "0x8084a4ed8849b7b12e57f9e443ece05e89838767",
];

/** The admin/version views the preflight needs from the escrow. */
export const jobEscrowAdminAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "relayers",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "SETTLEMENT_ABI_VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SettlementPreflightReport {
  /** Are all three settlement settings present at all? */
  configured: boolean;
  /** Safe to enable real settlement: configured AND every check passed. */
  ok: boolean;
  /** Which service the platform will actually use right now. */
  mode: "mock" | "chain";
  chainId: number | null;
  escrow: string | null;
  /** Address derived from `SETTLEMENT_PRIVATE_KEY` (never the key itself). */
  signer: string | null;
  /** On-chain `owner()` of the escrow, if it could be read. */
  owner: string | null;
  checks: PreflightCheck[];
}

/** Narrow chain surface, so tests need no RPC. */
export interface PreflightDeps {
  getChainId(): Promise<number>;
  getBytecode(address: Address): Promise<Hex | undefined>;
  getOwner(address: Address): Promise<Address>;
  isRelayer(address: Address, who: Address): Promise<boolean>;
  getAbiVersion(address: Address): Promise<bigint>;
}

function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  // viem throws multi-line errors with a call trace; keep only the headline.
  return message.split("\n")[0];
}

/** Real deps backed by the configured Monad RPC. */
export function chainPreflightDeps(rpcUrl: string): PreflightDeps {
  const client = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
  return {
    getChainId: () => client.getChainId(),
    getBytecode: (address) => client.getBytecode({ address }),
    getOwner: (address) =>
      client.readContract({ address, abi: jobEscrowAdminAbi, functionName: "owner" }),
    isRelayer: (address, who) =>
      client.readContract({
        address,
        abi: jobEscrowAdminAbi,
        functionName: "relayers",
        args: [who],
      }),
    getAbiVersion: (address) =>
      client.readContract({
        address,
        abi: jobEscrowAdminAbi,
        functionName: "SETTLEMENT_ABI_VERSION",
      }),
  };
}

/**
 * Run every settlement safety check. Read-only; never sends a transaction.
 *
 * `SETTLEMENT_FORBIDDEN_ADDRESS` is a **required** comma-separated deny-list of
 * addresses that must never be the signer or the owner (e.g. a key known to have
 * been exposed). A missing/empty value fails closed, and the code-level
 * `COMPROMISED_SETTLEMENT_ADDRESSES` are always merged in, so a match fails the
 * preflight even if the environment variable is mis-set.
 */
export async function runSettlementPreflight(
  env: Env,
  deps?: PreflightDeps,
): Promise<SettlementPreflightReport> {
  const escrow = (env.JOB_ESCROW_ADDRESS ?? "").trim();
  const rpcUrl = (env.MONAD_RPC_URL ?? "").trim();
  const key = (env.SETTLEMENT_PRIVATE_KEY ?? "").trim();
  const configured = Boolean(escrow && rpcUrl && key);

  const checks: PreflightCheck[] = [];
  const push = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  if (!configured) {
    push(
      "configured",
      false,
      "JOB_ESCROW_ADDRESS, MONAD_RPC_URL and SETTLEMENT_PRIVATE_KEY must all be set; " +
        "while any is missing, MockSettlementService stays in effect (is_mock = true)",
    );
    return {
      configured: false,
      ok: false,
      mode: "mock",
      chainId: null,
      escrow: escrow || null,
      signer: null,
      owner: null,
      checks,
    };
  }

  // Derive the signer address (never echo the key).
  let signer: Address | null = null;
  try {
    signer = privateKeyToAccount(key as Hex).address;
    push("signer", true, `relayer signer ${signer}`);
  } catch (cause) {
    push("signer", false, `SETTLEMENT_PRIVATE_KEY is invalid: ${errorMessage(cause)}`);
  }

  const client = deps ?? chainPreflightDeps(rpcUrl);

  // The RPC must actually be Monad testnet — never mainnet, never a fork.
  let chainId: number | null = null;
  try {
    chainId = await client.getChainId();
    push(
      "chain",
      chainId === MONAD_TESTNET_CHAIN_ID,
      `RPC reports chainId ${chainId} (expected ${MONAD_TESTNET_CHAIN_ID})`,
    );
  } catch (cause) {
    push("chain", false, `RPC unreachable: ${errorMessage(cause)}`);
  }

  // The escrow address must be a deployed contract.
  let hasCode = false;
  try {
    const bytecode = await client.getBytecode(escrow as Address);
    hasCode = Boolean(bytecode && bytecode !== "0x");
    push("escrow_code", hasCode, hasCode ? "escrow has code" : "no contract code at the escrow address");
  } catch (cause) {
    push("escrow_code", false, `could not read escrow bytecode: ${errorMessage(cause)}`);
  }

  // Read the on-chain owner and confirm the auth model.
  let owner: Address | null = null;
  if (hasCode) {
    try {
      owner = await client.getOwner(escrow as Address);
      push("owner", true, `escrow owner ${owner}`);
    } catch (cause) {
      push("owner", false, `could not read escrow owner: ${errorMessage(cause)}`);
    }

    // The escrow must be the hardened revision, not a stale deployment that
    // merely exposes owner()/relayers(). A mismatch or revert fails closed.
    try {
      const version = await client.getAbiVersion(escrow as Address);
      const current = version === SETTLEMENT_ABI_VERSION_EXPECTED;
      push(
        "escrow_abi_version",
        current,
        current
          ? `escrow reports SETTLEMENT_ABI_VERSION ${version}`
          : `escrow reports SETTLEMENT_ABI_VERSION ${version} (expected ` +
              `${SETTLEMENT_ABI_VERSION_EXPECTED}); redeploy the hardened JobEscrow`,
      );
    } catch (cause) {
      push(
        "escrow_abi_version",
        false,
        "escrow does not report SETTLEMENT_ABI_VERSION (stale or unknown " +
          `contract): ${errorMessage(cause)}`,
      );
    }

    if (signer && owner) {
      push(
        "owner_neq_relayer",
        signer.toLowerCase() !== owner.toLowerCase(),
        signer.toLowerCase() !== owner.toLowerCase()
          ? "owner and relayer are separate addresses"
          : "the settlement signer must not also be the escrow owner",
      );
    }

    if (signer) {
      try {
        const isRelayer = await client.isRelayer(escrow as Address, signer);
        push(
          "signer_is_relayer",
          isRelayer,
          isRelayer ? "signer is an allow-listed relayer" : "signer is not an allow-listed relayer",
        );
      } catch (cause) {
        push("signer_is_relayer", false, `could not read relayers(): ${errorMessage(cause)}`);
      }
    }
  }

  // The deny-list is required: an operator must explicitly enumerate
  // known-compromised addresses before real money can move. The code-level list
  // is always merged in, so the exposed signer is rejected even if the env value
  // is blank, unrelated, or accidentally cleared.
  const configuredForbidden = (env.SETTLEMENT_FORBIDDEN_ADDRESS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  push(
    "forbidden_configured",
    configuredForbidden.length > 0,
    configuredForbidden.length > 0
      ? `SETTLEMENT_FORBIDDEN_ADDRESS lists ${configuredForbidden.length} address(es)`
      : "SETTLEMENT_FORBIDDEN_ADDRESS must list at least one known-compromised " +
          "address before real settlement can be enabled",
  );

  const forbidden = new Set<string>([
    ...COMPROMISED_SETTLEMENT_ADDRESSES.map((address) => address.toLowerCase()),
    ...configuredForbidden,
  ]);
  const used = [signer, owner]
    .filter((value): value is Address => Boolean(value))
    .map((value) => value.toLowerCase())
    .filter((value) => forbidden.has(value));
  push(
    "not_forbidden",
    used.length === 0,
    used.length === 0
      ? "signer and owner are not on the forbidden list"
      : `configured addresses are on the forbidden list: ${used.join(", ")}`,
  );

  const ok = checks.every((check) => check.ok);
  return {
    configured: true,
    ok,
    mode: ok ? "chain" : "mock",
    chainId,
    escrow,
    signer,
    owner,
    checks,
  };
}
