/**
 * Pagination helper tests.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  paginated,
  parsePagination,
} from "../pagination";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe("parsePagination", () => {
  it("uses defaults when no params are present", () => {
    const page = parsePagination(params(""));
    expect(page).toEqual({ page: 1, perPage: DEFAULT_PER_PAGE, from: 0, to: DEFAULT_PER_PAGE - 1 });
  });

  it("computes the range for a given page and size", () => {
    expect(parsePagination(params("page=3&per_page=10"))).toEqual({
      page: 3,
      perPage: 10,
      from: 20,
      to: 29,
    });
  });

  it("caps per_page at MAX_PER_PAGE", () => {
    expect(parsePagination(params("per_page=10000")).perPage).toBe(MAX_PER_PAGE);
  });

  it.each(["0", "-1", "abc", ""])(
    "falls back to defaults for an invalid page value (%p)",
    (raw) => {
      const page = parsePagination(params(`page=${raw}`));
      expect(page.page).toBe(1);
      expect(page.from).toBe(0);
    },
  );
});

describe("paginated", () => {
  it("builds the standard envelope shape", () => {
    expect(paginated([1, 2], 5, { page: 2, perPage: 2 })).toEqual({
      items: [1, 2],
      total: 5,
      page: 2,
      per_page: 2,
    });
  });
});
