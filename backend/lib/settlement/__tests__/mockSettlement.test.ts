/**
 * MockSettlementService tests.
 */

import { describe, it, expect } from "vitest";
import { MockSettlementService } from "../service";

const service = new MockSettlementService();

describe("MockSettlementService", () => {
  it("records mock settlement with a deterministic tx hash", async () => {
    const input = {
      jobId: "job-a",
      taskId: "task-a",
      submissionId: "sub-a",
      annotationHash: "0xannot",
      policyHash: "0xpolicy",
      amount: "1.5",
      payeeAddress: "0x1111111111111111111111111111111111111111",
    };
    const first = await service.settle(input);
    const second = await service.settle(input);

    expect(first.is_mock).toBe(true);
    expect(first.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(second).toEqual(first);
  });

  it("derives a different hash for a different task", async () => {
    const base = {
      jobId: "job-a",
      submissionId: "sub-a",
      annotationHash: "0xannot",
      policyHash: "0xpolicy",
      amount: "1.5",
      payeeAddress: "0x1111111111111111111111111111111111111111",
    };
    const a = await service.settle({ ...base, taskId: "task-a" });
    const b = await service.settle({ ...base, taskId: "task-b" });
    expect(a.tx_hash).not.toBe(b.tx_hash);
  });

  it("notifies the caller with the hash as soon as it is known", async () => {
    const seen: string[] = [];
    const result = await service.settle({
      jobId: "job-a",
      taskId: "task-a",
      submissionId: "sub-a",
      annotationHash: "0xannot",
      policyHash: "0xpolicy",
      amount: "1.5",
      payeeAddress: "0x1111111111111111111111111111111111111111",
      onSubmitted: (hash, isMock) => {
        seen.push(`${hash}:${isMock}`);
      },
    });
    expect(seen).toEqual([`${result.tx_hash}:true`]);
  });

  it("verifies its own hash and rejects a foreign one", async () => {
    const req = {
      jobId: "job-a",
      taskId: "task-a",
      submissionId: "sub-a",
      annotationHash: "0xannot",
      policyHash: "0xpolicy",
      amount: "1.5",
      payeeAddress: "0x1111111111111111111111111111111111111111",
    };
    const { tx_hash } = await service.settle(req);
    expect(await service.verify(req, tx_hash!)).toEqual({ tx_hash, is_mock: true });
    expect(await service.verify(req, `0x${"00".repeat(32)}`)).toBeNull();
  });
});