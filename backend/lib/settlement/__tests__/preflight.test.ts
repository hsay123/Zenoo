/**
 * Settlement preflight tests.
 *
 * The preflight is the fail-closed gate in front of real settlement: it must
 * refuse unless the RPC is Monad testnet, the escrow is a real contract, the
 * signer is an allow-listed relayer that is *not* the owner, and no configured
 * address is on the forbidden list.
 */

import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  runSettlementPreflight,
  MONAD_TESTNET_CHAIN_ID,
  SETTLEMENT_ABI_VERSION_EXPECTED,
  COMPROMISED_SETTLEMENT_ADDRESSES,
  type PreflightDeps,
} from "../preflight";
import type { Env } from "@/lib/env";

const KEY = `0x${"11".repeat(32)}` as Hex;
const SIGNER = privateKeyToAccount(KEY).address;
const ESCROW = "0x000000000000000000000000000000000000dEaD" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const FORBIDDEN = "0x3333333333333333333333333333333333333333" as Address;
const EXPOSED = "0x8084a4eD8849B7B12E57f9e443ECe05E89838767" as Address;

const baseEnv = {
  JOB_ESCROW_ADDRESS: ESCROW,
  MONAD_RPC_URL: "https://testnet-rpc.monad.xyz",
  SETTLEMENT_PRIVATE_KEY: KEY,
  SETTLEMENT_FORBIDDEN_ADDRESS: FORBIDDEN,
} as unknown as Env;

function deps(overrides: Partial<PreflightDeps> = {}): PreflightDeps {
  return {
    getChainId: async () => MONAD_TESTNET_CHAIN_ID,
    getBytecode: async () => "0x6000" as Hex,
    getOwner: async () => OWNER,
    isRelayer: async () => true,
    getAbiVersion: async () => SETTLEMENT_ABI_VERSION_EXPECTED,
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

  it("passes every check for a valid Monad-testnet deployment", async () => {
    const report = await runSettlementPreflight(baseEnv, deps());

    expect(report.configured).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.mode).toBe("chain");
    expect(report.chainId).toBe(MONAD_TESTNET_CHAIN_ID);
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
