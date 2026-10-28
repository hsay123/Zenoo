/**
 * Job lifecycle guard tests (pure, no DB).
 */

import { describe, it, expect } from "vitest";
import { HttpError } from "@/lib/api/errors";
import { TRANSITIONS, assertTransition } from "../lifecycle";

describe("assertTransition", () => {
  it("allows pause from published", () => {
    expect(() => assertTransition("published", TRANSITIONS.pause, "paused")).not.toThrow();
  });

  it("allows resume from paused", () => {
    expect(() => assertTransition("paused", TRANSITIONS.resume, "published")).not.toThrow();
  });

  it("allows close from published and paused", () => {
    expect(() => assertTransition("published", TRANSITIONS.close, "closed")).not.toThrow();
    expect(() => assertTransition("paused", TRANSITIONS.close, "closed")).not.toThrow();
  });

  it("refuses pause from draft/closed", () => {
    for (const s of ["draft", "closed", "paused"] as const) {
      expect(() => assertTransition(s, TRANSITIONS.pause, "paused")).toThrow(HttpError);
    }
  });

  it("refuses resume from anything but paused", () => {
    for (const s of ["draft", "published", "closed"] as const) {
      expect(() => assertTransition(s, TRANSITIONS.resume, "published")).toThrow(HttpError);
    }
  });

  it("refuses close from draft", () => {
    expect(() => assertTransition("draft", TRANSITIONS.close, "closed")).toThrow(HttpError);
  });

  it("maps a refusal to a 409 CONFLICT", () => {
    try {
      assertTransition("draft", TRANSITIONS.pause, "paused");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(409);
      expect((err as HttpError).code).toBe("CONFLICT");
    }
  });
});
