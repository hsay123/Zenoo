/**
 * Pagination helpers for `PaginatedList<T>` endpoints.
 */

import type { PaginatedList } from "@/src/types/api";

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

export interface PageParams {
  page: number;
  perPage: number;
  /** Inclusive range start (Supabase `.range(from, to)`). */
  from: number;
  /** Inclusive range end (Supabase `.range(from, to)`). */
  to: number;
}

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** Parse `page` / `per_page` query params with sane defaults and caps. */
export function parsePagination(searchParams: URLSearchParams): PageParams {
  const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const perPage = parsePositiveInt(
    searchParams.get("per_page"),
    DEFAULT_PER_PAGE,
    MAX_PER_PAGE,
  );
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  return { page, perPage, from, to };
}

/** Build the standard paginated response shape. */
export function paginated<T>(
  items: T[],
  total: number,
  { page, perPage }: Pick<PageParams, "page" | "perPage">,
): PaginatedList<T> {
  return { items, total, page, per_page: perPage };
}
