import { describe, expect, it } from "vitest";
import { contributorWeights, quoteSplit } from "../split";

const b = (n: number) => BigInt(n);

describe("quoteSplit (mirrors RoyaltySplitter.quote)", () => {
  it("splits 1 USDC 50/30/20", () => {
    expect(quoteSplit(b(1_000_000), [b(1)])).toEqual({
      zeno: b(500_000),
      dataOwner: b(300_000),
      contributors: b(200_000),
      perContributor: [b(200_000)],
    });
  });

  it("weights contributors and matches the Solidity test vectors", () => {
    expect(quoteSplit(b(4_000_000), [b(1), b(3)])).toEqual({
      zeno: b(2_000_000),
      dataOwner: b(1_200_000),
      contributors: b(800_000),
      perContributor: [b(200_000), b(600_000)],
    });
  });

  it("gives rounding dust to Zeno so the total is exact", () => {
    const q = quoteSplit(b(1_000_001), [b(1), b(1), b(1)]);
    const total = q.zeno + q.dataOwner + q.perContributor.reduce((x, y) => x + y, b(0));
    expect(total).toBe(b(1_000_001));
    expect(q.dataOwner).toBe(b(300_000));
  });

  it("refuses invalid inputs", () => {
    expect(() => quoteSplit(b(0), [b(1)])).toThrow();
    expect(() => quoteSplit(b(1), [])).toThrow();
    expect(() => quoteSplit(b(1), [b(0)])).toThrow();
  });
});

describe("contributorWeights", () => {
  const W1 = "0x1111111111111111111111111111111111111111";
  const W2 = "0x2222222222222222222222222222222222222222";

  it("counts one weight per accepted label, merges by wallet, heaviest first", () => {
    const result = contributorWeights([
      { contributor_id: "a", wallet_address: W2 },
      { contributor_id: "b", wallet_address: W1 },
      { contributor_id: "b", wallet_address: W1.toUpperCase().replace("0X", "0x") },
      { contributor_id: "c", wallet_address: null },
    ]);
    expect(result).toEqual({
      recipients: [
        { wallet: W1, weight: b(2) },
        { wallet: W2, weight: b(1) },
      ],
      skippedWithoutWallet: 1,
    });
  });

  it("caps the list at the contract limit", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      contributor_id: String(i),
      wallet_address: `0x${String(i + 1).repeat(40)}`,
    }));
    expect(contributorWeights(rows, 3).recipients).toHaveLength(3);
  });
});
