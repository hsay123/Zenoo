import { describe, expect, it } from "vitest";
import { detectIntegrityFlags, type IntegrityInput } from "../graph";

const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";

const base = (): IntegrityInput => ({
  accounts: [
    { id: "buyer", wallet_address: null },
    { id: "alice", wallet_address: W1 },
    { id: "bob", wallet_address: W2 },
    { id: "rev", wallet_address: null },
  ],
  jobs: [{ id: "job-1", buyer_id: "buyer", funding_wallet_address: null }],
  submissions: [],
  reviews: [],
});

const sub = (over: Partial<IntegrityInput["submissions"][number]>) => ({
  id: "s",
  contributor_id: "alice",
  task_id: "t",
  asset_id: "a",
  job_id: "job-1",
  content_hash: "0xaaa",
  has_content: true,
  status: "submitted",
  ...over,
});

const signals = (input: IntegrityInput) =>
  detectIntegrityFlags(input).map((f) => `${f.user_id}:${f.signal}:${f.related_user_id ?? "-"}`).sort();

describe("detectIntegrityFlags", () => {
  it("finds nothing for unrelated, honest accounts", () => {
    const input = base();
    input.submissions = [
      sub({ id: "s1", contributor_id: "alice", asset_id: "a1", content_hash: "0x1", status: "accepted" }),
      sub({ id: "s2", contributor_id: "bob", asset_id: "a2", content_hash: "0x1", status: "accepted" }),
    ];
    input.reviews = [{ submission_id: "s1", reviewer_id: "rev" }];
    expect(detectIntegrityFlags(input)).toEqual([]);
  });

  it("wallet_link: a contributor's payout wallet funded a buyer's job", () => {
    const input = base();
    input.jobs[0].funding_wallet_address = W1.toUpperCase().replace("0X", "0x");
    expect(signals(input)).toEqual(["alice:wallet_link:buyer", "buyer:wallet_link:alice"]);
    const flag = detectIntegrityFlags(input).find((f) => f.user_id === "alice")!;
    expect(flag.evidence).toMatchObject({ wallet: W1, this_account: "payout wallet" });
  });

  it("duplicate_work: identical labels on the same asset from two accounts", () => {
    const input = base();
    input.submissions = [
      sub({ id: "s1", contributor_id: "alice", task_id: "t1" }),
      sub({ id: "s2", contributor_id: "bob", task_id: "t2" }),
    ];
    expect(signals(input)).toEqual(["alice:duplicate_work:bob", "bob:duplicate_work:alice"]);
  });

  it("ignores identical empty submissions and the same labels on different assets", () => {
    const input = base();
    input.submissions = [
      sub({ id: "s1", contributor_id: "alice", has_content: false }),
      sub({ id: "s2", contributor_id: "bob", has_content: false }),
      sub({ id: "s3", contributor_id: "alice", asset_id: "x" }),
      sub({ id: "s4", contributor_id: "bob", asset_id: "y" }),
    ];
    expect(detectIntegrityFlags(input)).toEqual([]);
  });

  it("self_dealing: a buyer labels and gets paid for their own job", () => {
    const input = base();
    input.submissions = [sub({ id: "s1", contributor_id: "buyer", status: "paid" })];
    const flags = detectIntegrityFlags(input);
    expect(flags).toEqual([
      expect.objectContaining({
        user_id: "buyer",
        related_user_id: null,
        signal: "self_dealing",
        evidence: expect.objectContaining({ reason: "labelled own job" }),
      }),
    ]);
  });

  it("self_dealing: accepted work on a job owned by a wallet-linked account", () => {
    const input = base();
    input.jobs[0].funding_wallet_address = W1; // alice's wallet funded buyer's job
    input.submissions = [sub({ id: "s1", contributor_id: "alice", status: "accepted" })];
    expect(signals(input)).toContain("alice:self_dealing:buyer");
  });

  it("does not flag self_dealing for work still in review", () => {
    const input = base();
    input.submissions = [sub({ id: "s1", contributor_id: "buyer", status: "submitted" })];
    expect(detectIntegrityFlags(input)).toEqual([]);
  });

  it("linked_review: a reviewer decided work of an account they are linked to", () => {
    const input = base();
    input.submissions = [
      sub({ id: "s1", contributor_id: "alice", asset_id: "a1", content_hash: "0xdup" }),
      sub({ id: "s2", contributor_id: "rev", asset_id: "a1", content_hash: "0xdup" }),
      sub({ id: "s3", contributor_id: "alice", asset_id: "a9", content_hash: "0xz" }),
    ];
    input.reviews = [{ submission_id: "s3", reviewer_id: "rev" }];
    expect(signals(input)).toContain("rev:linked_review:alice");
  });

  it("links transitively through clusters (A~B by wallet, B~C by duplicate work)", () => {
    const input = base();
    input.jobs[0].funding_wallet_address = W1; // alice ~ buyer
    input.submissions = [
      sub({ id: "s1", contributor_id: "alice", asset_id: "a5", content_hash: "0xq" }),
      sub({ id: "s2", contributor_id: "bob", asset_id: "a5", content_hash: "0xq" }), // bob ~ alice
      sub({ id: "s3", contributor_id: "bob", asset_id: "a6", content_hash: "0xr", status: "accepted" }),
    ];
    // bob's accepted work is on buyer's job, and bob is linked to buyer via alice.
    expect(signals(input)).toContain("bob:self_dealing:buyer");
  });
});
