/**
 * selectSettlementService tests.
 *
 * Real settlement must never be enabled merely because the three settings
 * exist. The chain service is selected only when the fail-closed preflight
 * passes; any other outcome (not configured, preflight FAIL, preflight error)
 * keeps the honest `MockSettlementService` (is_mock = true).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  selectSettlementService,
  mockSettlementService,
  type SettlementService,
} from "../service";
import { runSettlementPreflight } from "../preflight";
import type { Env } from "@/lib/env";

vi.mock("../preflight", () => ({
  runSettlementPreflight: vi.fn(),
}));

const env = {
  JOB_ESCROW_ADDRESS: "0x000000000000000000000000000000000000dEaD",
  MONAD_RPC_URL: "https://testnet-rpc.monad.xyz",
  SETTLEMENT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  SETTLEMENT_FORBIDDEN_ADDRESS: "0x3333333333333333333333333333333333333333",
} as unknown as Env;

const chainService: SettlementService = {
  settle: async () => ({ tx_hash: null, is_mock: false }),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectSettlementService", () => {
  it("stays on the mock when settlement is not configured at all", async () => {
    const preflight = vi.fn(async () => ({ ok: true, checks: [] }));

    const service = await selectSettlementService({
      env: {} as Env,
      chainFactory: () => null,
      preflight,
    });

    expect(service).toBe(mockSettlementService);
    // No point running the preflight when there is nothing to gate.
    expect(preflight).not.toHaveBeenCalled();
  });

  it("selects the chain service only when the preflight passes", async () => {
    const service = await selectSettlementService({
      env,
      chainFactory: () => chainService,
      preflight: async () => ({ ok: true, checks: [{ name: "chain", ok: true, detail: "" }] }),
    });

    expect(service).toBe(chainService);
  });

  it("falls back to the mock when the preflight fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = await selectSettlementService({
      env,
      chainFactory: () => chainService,
      preflight: async () => ({
        ok: false,
        checks: [{ name: "escrow_abi_version", ok: false, detail: "stale" }],
      }),
    });

    expect(service).toBe(mockSettlementService);
    expect(console.warn).toHaveBeenCalled();
  });

  it("falls back to the mock when the preflight itself throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = await selectSettlementService({
      env,
      chainFactory: () => chainService,
      preflight: async () => {
        throw new Error("rpc down");
      },
    });

    expect(service).toBe(mockSettlementService);
    expect(console.warn).toHaveBeenCalled();
  });

  it("uses the real fail-closed preflight by default", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(runSettlementPreflight).mockResolvedValueOnce({
      configured: true,
      ok: false,
      mode: "mock",
      chainId: 10143,
      escrow: null,
      signer: null,
      owner: null,
      checks: [{ name: "escrow_abi_version", ok: false, detail: "stale" }],
    });

    const service = await selectSettlementService({ env, chainFactory: () => chainService });

    expect(runSettlementPreflight).toHaveBeenCalledWith(env);
    expect(service).toBe(mockSettlementService);
  });
});
