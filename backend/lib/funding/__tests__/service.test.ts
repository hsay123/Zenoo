/**
 * Card/UPI funding state-machine tests, against an in-memory stand-in for the
 * two tables involved (jobs, job_payments).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import type { Env } from "@/lib/env";
import type { DodoConfig, DodoPayment } from "../dodo";
import type { TreasuryFunder } from "../treasury";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { jobs: [], job_payments: [] };

/** Minimal PostgREST-like builder: eq/in filters, update/insert/select, single. */
function table(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let insertRow: Row | null = null;
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col: string, value: unknown) => {
      filters.push((row) => row[col] === value);
      return builder;
    },
    in: (col: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[col]));
      return builder;
    },
    update: (p: Row) => {
      patch = p;
      return builder;
    },
    insert: (r: Row) => {
      insertRow = { id: `pay-${db[name].length + 1}`, created_at: new Date().toISOString(), ...r };
      return builder;
    },
    run(): Row[] {
      if (insertRow) {
        db[name].push(insertRow);
        return [insertRow];
      }
      const rows = db[name].filter((row) => filters.every((f) => f(row)));
      if (patch) rows.forEach((row) => Object.assign(row, patch));
      return rows;
    },
    maybeSingle: async () => ({ data: builder.run()[0] ?? null, error: null }),
    single: async () => ({ data: builder.run()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: builder.run(), error: null }),
  };
  return builder;
}

vi.mock("@/lib/db/supabase", () => ({ getSupabase: () => ({ from: (name: string) => table(name) }) }));

const { applyPaymentSucceeded, chainJobIdFor, fundPaidPayment } = await import("../service");

const TREASURY = "0x1111111111111111111111111111111111111111" as Address;
const CONFIG: DodoConfig = { apiKey: "k", webhookSecret: "s", productId: "p", baseUrl: "x" };
const ENV = { ZENO_FEE_BPS: 2000 } as unknown as Env;

function seed() {
  db.jobs = [{ id: "job-1", funding_status: "unfunded", funding_wallet_address: null }];
  db.job_payments = [
    {
      id: "pay-1",
      job_id: "job-1",
      buyer_id: "buyer-1",
      provider: "dodo",
      status: "created",
      checkout_session_id: "cks_1",
      provider_payment_id: null,
      amount_cents: 500,
      currency: "USD",
      payout_amount: 4,
      fee_amount: 1,
      funding_tx_hash: null,
      error: null,
      created_at: "2026-10-29T00:00:00Z",
    },
  ];
}

function dodoPayment(overrides: Partial<DodoPayment> = {}): DodoPayment {
  return {
    payment_id: "dodo_pay_1",
    status: "succeeded",
    total_amount: 500,
    currency: "USD",
    metadata: { zeno_payment_id: "pay-1", job_id: "job-1" },
    checkout_session_id: "cks_1",
    ...overrides,
  };
}

function fakeTreasury(opts: { fail?: boolean; verify?: "ok" | "pending" } = {}) {
  const calls = { fund: 0, verify: 0 };
  const treasury = {
    address: TREASURY,
    fund: async (_job: Hex, units: bigint, onSubmitted?: (h: Hex) => Promise<void> | void) => {
      calls.fund += 1;
      const hash = `0x${"aa".repeat(32)}` as Hex;
      await onSubmitted?.(hash);
      if (opts.fail) throw new Error("rpc down");
      return { txHash: hash, amount: units };
    },
    verify: async (_hash: Hex, _job: Hex, units: bigint) => {
      calls.verify += 1;
      return opts.verify === "pending" ? null : { ok: true as const, amount: units };
    },
  } as unknown as TreasuryFunder;
  return { treasury, calls };
}

const apply = (payment: DodoPayment, treasury: TreasuryFunder | null) =>
  applyPaymentSucceeded({ payment_id: payment.payment_id }, ENV, {
    config: CONFIG,
    fetchPayment: async () => payment,
    treasury,
  });

beforeEach(seed);

describe("applyPaymentSucceeded", () => {
  it("marks the payment paid, funds escrow from the treasury, and marks the job funded", async () => {
    const { treasury, calls } = fakeTreasury();
    const outcome = await apply(dodoPayment(), treasury);

    expect(outcome).toEqual({ handled: true, payment_id: "pay-1", state: "funded" });
    expect(calls.fund).toBe(1);
    expect(db.job_payments[0]).toMatchObject({
      status: "funded",
      provider_payment_id: "dodo_pay_1",
      funding_tx_hash: `0x${"aa".repeat(32)}`,
    });
    expect(db.jobs[0]).toMatchObject({
      funding_status: "funded",
      funded_amount: "4",
      funding_wallet_address: TREASURY.toLowerCase(),
      chain_job_id: chainJobIdFor("job-1"),
    });
  });

  it("is idempotent: a redelivered event does not fund twice", async () => {
    const { treasury, calls } = fakeTreasury();
    await apply(dodoPayment(), treasury);
    const again = await apply(dodoPayment(), treasury);
    expect(again).toEqual({ handled: true, payment_id: "pay-1", state: "funded" });
    expect(calls.fund).toBe(1);
  });

  it("without a treasury, leaves the job pending and the payment paid (awaiting funding)", async () => {
    const outcome = await apply(dodoPayment(), null);
    expect(outcome).toEqual({ handled: true, payment_id: "pay-1", state: "awaiting_funding" });
    expect(db.job_payments[0].status).toBe("paid");
    expect(db.jobs[0].funding_status).toBe("pending");
    expect(db.jobs[0].funding_wallet_address).toBeNull();
  });

  it("ignores a payment that is not succeeded", async () => {
    const outcome = await apply(dodoPayment({ status: "processing" }), fakeTreasury().treasury);
    expect(outcome.handled).toBe(false);
    expect(db.job_payments[0].status).toBe("created");
    expect(db.jobs[0].funding_status).toBe("unfunded");
  });

  it("refuses an underpayment", async () => {
    const outcome = await apply(dodoPayment({ total_amount: 499 }), fakeTreasury().treasury);
    expect(outcome).toEqual({ handled: false, reason: "paid amount is less than the quoted amount" });
    expect(db.jobs[0].funding_status).toBe("unfunded");
  });

  it("refuses a different currency, a foreign session, and missing metadata", async () => {
    const t = fakeTreasury().treasury;
    expect((await apply(dodoPayment({ currency: "INR" }), t)).handled).toBe(false);
    expect((await apply(dodoPayment({ checkout_session_id: "cks_other" }), t)).handled).toBe(false);
    expect((await apply(dodoPayment({ metadata: {} }), t)).handled).toBe(false);
    expect(db.job_payments[0].status).toBe("created");
  });

  it("does not touch a job already funded another way, and flags the payment for refund", async () => {
    db.jobs[0].funding_status = "funded";
    const { treasury, calls } = fakeTreasury();
    const outcome = await apply(dodoPayment(), treasury);
    expect(outcome).toEqual({ handled: true, payment_id: "pay-1", state: "paid" });
    expect(calls.fund).toBe(0);
    expect(String(db.job_payments[0].error)).toMatch(/refund/);
  });
});

describe("double-funding guard", () => {
  it("never treasury-funds a job that is pending through the buyer's own wallet", async () => {
    db.jobs[0].funding_status = "pending";
    db.jobs[0].funding_wallet_address = "0x9999999999999999999999999999999999999999";
    const { treasury, calls } = fakeTreasury();
    const outcome = await apply(dodoPayment(), treasury);
    expect(outcome).toEqual({ handled: true, payment_id: "pay-1", state: "paid" });
    expect(calls.fund).toBe(0);
    expect(String(db.job_payments[0].error)).toMatch(/refund/);
    expect(db.jobs[0].funding_status).toBe("pending");
  });

  it("an admin retry also refuses once the buyer's wallet took over the job", async () => {
    await apply(dodoPayment(), null); // paid, job pending with no wallet
    db.jobs[0].funding_wallet_address = "0x9999999999999999999999999999999999999999";
    const { treasury, calls } = fakeTreasury();
    await fundPaidPayment("pay-1", { treasury });
    expect(calls.fund).toBe(0);
    expect(String(db.job_payments[0].error)).toMatch(/refund/);
  });
});

describe("fundPaidPayment", () => {
  it("keeps the payment paid with the error when funding fails, and keeps the tx hash", async () => {
    await apply(dodoPayment(), null); // paid, awaiting funding
    const { treasury } = fakeTreasury({ fail: true });
    const outcome = await fundPaidPayment("pay-1", { treasury });
    expect(outcome).toEqual({ handled: true, payment_id: "pay-1", state: "paid" });
    expect(db.job_payments[0]).toMatchObject({ status: "paid", error: "rpc down" });
    expect(db.job_payments[0].funding_tx_hash).toBe(`0x${"aa".repeat(32)}`);
    expect(db.jobs[0].funding_status).toBe("pending");
  });

  it("re-verifies a broadcast tx on retry instead of sending again", async () => {
    await apply(dodoPayment(), null);
    await fundPaidPayment("pay-1", { treasury: fakeTreasury({ fail: true }).treasury });

    const { treasury, calls } = fakeTreasury();
    const outcome = await fundPaidPayment("pay-1", { treasury });
    expect(outcome.handled && outcome.state).toBe("funded");
    expect(calls.fund).toBe(0);
    expect(calls.verify).toBe(1);
    expect(db.jobs[0].funding_status).toBe("funded");
  });

  it("waits when the broadcast tx has no receipt yet", async () => {
    await apply(dodoPayment(), null);
    await fundPaidPayment("pay-1", { treasury: fakeTreasury({ fail: true }).treasury });
    const { treasury, calls } = fakeTreasury({ verify: "pending" });
    const outcome = await fundPaidPayment("pay-1", { treasury });
    expect(outcome).toEqual({ handled: true, payment_id: "pay-1", state: "paid" });
    expect(calls.fund).toBe(0);
    expect(db.jobs[0].funding_status).toBe("pending");
  });

  it("reports awaiting funding when no treasury is configured", async () => {
    await apply(dodoPayment(), null);
    expect(await fundPaidPayment("pay-1", { treasury: null })).toEqual({
      handled: true,
      payment_id: "pay-1",
      state: "awaiting_funding",
    });
  });
});
