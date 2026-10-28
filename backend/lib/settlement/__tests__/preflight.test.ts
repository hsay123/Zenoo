/**
 * Settlement preflight tests.
 *
 * The preflight is the fail-closed gate in front of real settlement: it must
 * refuse unless CHAIN_ID is allowed (Base Sepolia) and the RPC really is that
 * chain, the escrow is a real v3 contract holding the configured 6-decimal
 * USDC, the signer is an allow-listed relayer that is *not* the owner, and no
 * configured address is on the forbidden list.
 */

import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  runSettlementPreflight,
  SETTLEMENT_ABI_VERSION_EXPECTED,
  COMPROMISED_SETTLEMENT_ADDRESSES,
  type PreflightDeps,
} from "../preflight";
import type { Env } from "@/lib/env";
import { BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } from "../network";

const KEY = `0x${"11".repeat(32)}` as Hex;
const SIGNER = privateKeyToAccount(KEY).address;
const ESCROW = "0x000000000000000000000000000000000000dEaD" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const FORBIDDEN = "0x3333333333333333333333333333333333333333" as Address;
const EXPOSED = "0x8084a4eD8849B7B12E57f9e443ECe05E89838767" as Address;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const OTHER_TOKEN = "0x4444444444444444444444444444444444444444" as Address;

const baseEnv = {
  JOB_ESCROW_ADDRESS: ESCROW,
  CHAIN_ID: BASE_SEPOLIA_CHAIN_ID,
  RPC_URL: "https://sepolia.base.org",
  USDC_ADDRESS: USDC,
  SETTLEMENT_PRIVATE_KEY: KEY,
  SETTLEMENT_FORBIDDEN_ADDRESS: FORBIDDEN,
} as unknown as Env;

function deps(overrides: Partial<PreflightDeps> = {}): PreflightDeps {
  return {
    getChainId: async () => BASE_SEPOLIA_CHAIN_ID,
    getBytecode: async () => "0x6000" as Hex,
    getOwner: async () => OWNER,
    isRelayer: async () => true,
    getAbiVersion: async () => SETTLEMENT_ABI_VERSION_EXPECTED,
    getToken: async () => USDC,
    getTokenDecimals: async () => 6,
    ...overrides,
  };
}

const check = (report: Awaited<ReturnType<typeof runSettlementPreflight>>, name: string) =>
  report.checks.find((c) => c.name === name);

describe("runSettlementPreflight", () => {
  it("stays on mock and does not pass when settlement is unconfigured", async () => {
    const report = await runSettlementPreflight({ ...baseEnv, JOB_ESCROW_ADDRESS: "" } as Env, deps());

    expect(report.configured).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.mode).toBe("mock");
    expect(check(report, "configured")?.ok).toBe(false);
  });

  it("passes every check for a valid Base Sepolia USDC deployment", async () => {
    const report = await runSettlementPreflight(baseEnv, deps());

    expect(report.configured).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.mode).toBe("chain");
    expect(report.chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(report.signer).toBe(SIGNER);
    expect(report.owner).toBe(OWNER);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });

  it("fails closed on the wrong chain", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getChainId: async () => 1 }),
    );

    expect(report.ok).toBe(false);
    expect(report.mode).toBe("mock");
    expect(check(report, "chain")?.ok).toBe(false);
  });

  it("fails closed on Base mainnet while it is not on the allow-list", async () => {
    const report = await runSettlementPreflight(
      { ...baseEnv, CHAIN_ID: BASE_CHAIN_ID } as Env,
      deps({ getChainId: async () => BASE_CHAIN_ID }),
    );

    expect(report.ok).toBe(false);
    expect(report.mode).toBe("mock");
    expect(check(report, "chain_allowed")?.ok).toBe(false);
    // The RPC does match the configured id; only the allow-list refuses it.
    expect(check(report, "chain")?.ok).toBe(true);
  });

  it("fails closed when only the deprecated Monad RPC is configured", async () => {
    // MONAD_RPC_URL is still read as an alias so old configs load, but a Monad
    // RPC reports 10143, so settlement stays on the mock.
    const { RPC_URL: _unused, ...rest } = baseEnv as unknown as Record<string, unknown>;
    void _unused;
    const report = await runSettlementPreflight(
      { ...rest, MONAD_RPC_URL: "https://testnet-rpc.monad.xyz" } as unknown as Env,
      deps({ getChainId: async () => 10143 }),
    );

    expect(report.configured).toBe(true);
    expect(report.ok).toBe(false);
    expect(check(report, "chain")?.ok).toBe(false);
  });

  it("refuses the old native-MON escrow (ABI version 2)", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getAbiVersion: async () => BigInt(2) }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "escrow_abi_version")?.ok).toBe(false);
  });

  it("fails closed when USDC_ADDRESS is not configured", async () => {
    const report = await runSettlementPreflight(
      { ...baseEnv, USDC_ADDRESS: undefined } as Env,
      deps(),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "token")?.ok).toBe(false);
  });

  it("fails closed when the escrow holds a different token", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getToken: async () => OTHER_TOKEN }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "token")?.ok).toBe(false);
    expect(check(report, "token_decimals")).toBeUndefined();
  });

  it("matches the token address case-insensitively", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getToken: async () => USDC.toLowerCase() as Address }),
    );

    expect(check(report, "token")?.ok).toBe(true);
  });

  it("fails closed when the token does not use 6 decimals", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getTokenDecimals: async () => 18 }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "token_decimals")?.ok).toBe(false);
  });

  it("fails closed when the escrow does not expose token()", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({
        getToken: async () => {
          throw new Error("execution reverted");
        },
      }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "token")?.ok).toBe(false);
  });

  it("fails closed when the escrow has no code", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getBytecode: async () => "0x" }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "escrow_code")?.ok).toBe(false);
    // With no contract we cannot trust any role read, so none is attempted.
    expect(check(report, "owner")).toBeUndefined();
  });

  it("fails closed when the signer is not an allow-listed relayer", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ isRelayer: async () => false }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "signer_is_relayer")?.ok).toBe(false);
  });

  it("fails closed when the signer is also the owner", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getOwner: async () => SIGNER }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "owner_neq_relayer")?.ok).toBe(false);
  });

  it("fails closed when the signer is on the forbidden list", async () => {
    const report = await runSettlementPreflight(
      { ...baseEnv, SETTLEMENT_FORBIDDEN_ADDRESS: SIGNER } as Env,
      deps(),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "not_forbidden")?.ok).toBe(false);
  });

  it("fails closed when the owner is on the forbidden list", async () => {
    const report = await runSettlementPreflight(
      { ...baseEnv, SETTLEMENT_FORBIDDEN_ADDRESS: FORBIDDEN } as Env,
      deps({ getOwner: async () => FORBIDDEN }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "not_forbidden")?.ok).toBe(false);
  });

  it("fails closed when the deny-list is missing or empty", async () => {
    const report = await runSettlementPreflight(
      { ...baseEnv, SETTLEMENT_FORBIDDEN_ADDRESS: "" } as Env,
      deps(),
    );

    expect(report.ok).toBe(false);
    expect(report.mode).toBe("mock");
    expect(check(report, "forbidden_configured")?.ok).toBe(false);
  });

  it("fails closed when the escrow reports a stale ABI version", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({ getAbiVersion: async () => BigInt(1) }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "escrow_abi_version")?.ok).toBe(false);
  });

  it("fails closed when the escrow does not expose the ABI version", async () => {
    const report = await runSettlementPreflight(
      baseEnv,
      deps({
        getAbiVersion: async () => {
          throw new Error("execution reverted");
        },
      }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "escrow_abi_version")?.ok).toBe(false);
  });

  it("always rejects known-compromised addresses, even when the deny-list points elsewhere", async () => {
    const report = await runSettlementPreflight(
      { ...baseEnv, SETTLEMENT_FORBIDDEN_ADDRESS: FORBIDDEN } as Env,
      deps({ getOwner: async () => EXPOSED }),
    );

    expect(report.ok).toBe(false);
    expect(check(report, "not_forbidden")?.ok).toBe(false);
  });

  it("ships the exposed address in the built-in compromised list", () => {
    expect(COMPROMISED_SETTLEMENT_ADDRESSES.map((address) => address.toLowerCase())).toContain(
      EXPOSED.toLowerCase(),
    );
  });
});
