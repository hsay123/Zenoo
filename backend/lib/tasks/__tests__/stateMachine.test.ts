/**
 * State machine unit tests.
 */

import { describe, it, expect } from "vitest";
import {
  isLegalTransition,
  assertLegalTransition,
  TaskStatus,
} from "../stateMachine";

describe("Task State Machine", () => {
  // ---- Legal transitions ----
  const legal: [TaskStatus, TaskStatus][] = [
    ["available", "claimed"],
    ["claimed", "draft"],
    ["claimed", "available"],
    ["draft", "submitted"],
    ["submitted", "needs_revision"],
    ["submitted", "accepted"],
    ["submitted", "rejected"],
    ["needs_revision", "draft"],
    ["accepted", "paid"],
    ["rejected", "appealed"],
    ["appealed", "accepted"],
    ["appealed", "rejected"],
  ];

  it.each(legal)("%s -> %s is legal", (from, to) => {
    expect(isLegalTransition(from, to)).toBe(true);
  });

  // ---- Illegal transitions ----
  const illegal: [TaskStatus, TaskStatus][] = [
    ["paid", "accepted"],
    ["paid", "rejected"],
    ["rejected", "paid"],         // rejected is never paid
    ["accepted", "accepted"],     // no self-loop
    ["submitted", "paid"],        // must go through accepted first
    ["draft", "accepted"],
    ["available", "paid"],
  ];

  it.each(illegal)("%s -> %s is illegal", (from, to) => {
    expect(isLegalTransition(from, to)).toBe(false);
  });

  it("assertLegalTransition throws on illegal transition", () => {
    expect(() => assertLegalTransition("paid", "accepted")).toThrow(
      "Illegal task state transition",
    );
  });

  it("assertLegalTransition does not throw on legal transition", () => {
    expect(() => assertLegalTransition("submitted", "accepted")).not.toThrow();
  });
});
