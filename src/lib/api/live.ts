"use client";

/**
 * Client-side data layer for the product screens.
 *
 * Every read goes through the token-bound `PlatformClient` from `./platform`
 * (the browser holds the Privy access token, so reads cannot happen on the
 * server). This module deliberately exposes the *outcome* of a request —
 * loading / ready / error — as a discriminated union so callers can render
 * honest loading, empty, unauthorized and error states. There is no
 * "401 → empty list" fallback anywhere: a rejection is a rejection.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useSession, usePlatformClient } from "./session";
import {
  PlatformError,
  platformPaths,
  adminUserSchema,
  appealQueueItemSchema,
  earningsSummarySchema,
  jobSchema,
  projectSchema,
  publicReceiptSchema,
  reviewQueueItemSchema,
  taskSchema,
  workPayloadSchema,
  type PlatformClient,
} from "./platform";

export type QueryState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: PlatformError };

export type Query<T> = QueryState<T> & { reload: () => void };

/** Coerce anything thrown into a `PlatformError` we can render. */
export function asPlatformError(cause: unknown): PlatformError {
  if (cause instanceof PlatformError) return cause;
  return new PlatformError(
    "SERVER",
    cause instanceof Error ? cause.message : "The request failed.",
  );
}

/**
 * Shared query runner. The loader is held in a ref, so callers can build it
 * inline without re-fetching on every render — re-fetches are keyed explicitly.
 * `client` may be null (e.g. a public read before the platform is configured).
 */
function useQueryWithClient<T>(
  client: PlatformClient | null,
  key: string,
  loader: (client: PlatformClient) => Promise<T>,
  options?: { enabled?: boolean },
): Query<T> {
  const loaderRef = useRef(loader);
  const keyRef = useRef(key);

  // Keep the latest loader in a ref so callers can build it inline without
  // re-fetching on every render; re-fetches are keyed explicitly below.
  useEffect(() => {
    loaderRef.current = loader;
  });

  const enabled = (options?.enabled ?? true) && client !== null;
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<QueryState<T>>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !client) return;
    let active = true;
    const keyChanged = keyRef.current !== key;
    keyRef.current = key;

    const load = async () => {
      // Re-fetching the same resource keeps the last good data on screen (so a
      // mutation-triggered reload never blanks the view); a different key
      // starts from a clean loading state.
      setState((prev) =>
        keyChanged || prev.status !== "ready"
          ? { status: "loading", data: null, error: null }
          : prev,
      );
      try {
        const data = await loaderRef.current(client);
        if (active) setState({ status: "ready", data, error: null });
      } catch (cause) {
        if (active) {
          setState({ status: "error", data: null, error: asPlatformError(cause) });
        }
      }
    };
    void load();

    return () => {
      active = false;
    };
  }, [client, key, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/**
 * Run an authenticated read whenever `key` (or the underlying session) changes.
 */
export function useClientQuery<T>(
  key: string,
  loader: (client: PlatformClient) => Promise<T>,
  options?: { enabled?: boolean },
): Query<T> {
  const { client } = useSession();
  return useQueryWithClient(client, key, loader, options);
}

/**
 * Run a read that does not require a signed-in session — used for public
 * resources such as payout receipts, which the API serves without auth.
 */
export function usePublicQuery<T>(
  key: string,
  loader: (client: PlatformClient) => Promise<T>,
  options?: { enabled?: boolean },
): Query<T> {
  const client = usePlatformClient();
  return useQueryWithClient(client, key, loader, options);
}

/** Imperative action runner with pending/error state for mutations. */
export function useAction() {
  const { client } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlatformError | null>(null);

  const run = useCallback(
    async <T,>(fn: (client: PlatformClient) => Promise<T>): Promise<T | null> => {
      setPending(true);
      setError(null);
      try {
        return await fn(client);
      } catch (cause) {
        setError(asPlatformError(cause));
        return null;
      } finally {
        setPending(false);
      }
    },
    [client],
  );

  return { run, pending, error, setError, client };
}

// ------------------------------------------------------------- list helpers

const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number(),
    per_page: z.number(),
  });

const MAX_PAGES = 10;

/** Read every page of a `PaginatedList<T>` (up to `MAX_PAGES`) and flatten it. */
export async function fetchAllPages<T>(
  client: PlatformClient,
  itemSchema: z.ZodType<T>,
  path: string,
  filters?: Record<string, string>,
): Promise<T[]> {
  const schema = pageSchema(itemSchema);
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      ...(filters ?? {}),
      page: String(page),
      per_page: "100",
    });
    const result = await client.get(schema, `${path}?${params.toString()}`);
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) break;
  }
  return items;
}

// ------------------------------------------------------------- typed hooks

export function useJobs(filters?: { status?: string; modality?: string }) {
  const key = `jobs:${filters?.status ?? ""}:${filters?.modality ?? ""}`;
  return useClientQuery(key, (client) =>
    fetchAllPages(client, jobSchema, platformPaths.jobs(), filters),
  );
}

export function useJob(id: string) {
  return useClientQuery(`job:${id}`, (client) =>
    client.get(jobSchema, platformPaths.job(id)),
  );
}

export function useJobTasks(id: string) {
  return useClientQuery(`job-tasks:${id}`, (client) =>
    fetchAllPages(client, taskSchema, platformPaths.jobTasks(id)),
  );
}

export function useProjects() {
  return useClientQuery("projects", (client) =>
    fetchAllPages(client, projectSchema, platformPaths.projects()),
  );
}

export function useAvailableTasks(filters?: { modality?: string; job_id?: string }) {
  const key = `available-tasks:${filters?.modality ?? ""}:${filters?.job_id ?? ""}`;
  return useClientQuery(key, (client) =>
    fetchAllPages(client, taskSchema, platformPaths.availableTasks(), filters),
  );
}

export function useTask(id: string) {
  return useClientQuery(`task:${id}`, (client) =>
    client.get(taskSchema, platformPaths.task(id)),
  );
}

export function useWorkPayload(id: string) {
  return useClientQuery(
    `work-payload:${id}`,
    (client) => client.get(workPayloadSchema, platformPaths.saveDraft(id)),
    { enabled: Boolean(id) },
  );
}

export function useReviewQueue() {
  return useClientQuery("review-queue", (client) =>
    fetchAllPages(client, reviewQueueItemSchema, platformPaths.reviewQueue()),
  );
}

export function useAppealsQueue() {
  return useClientQuery("appeals-queue", (client) =>
    fetchAllPages(client, appealQueueItemSchema, platformPaths.appealsQueue()),
  );
}

export function useEarnings() {
  return useClientQuery("earnings", (client) =>
    client.get(earningsSummarySchema, platformPaths.earnings()),
  );
}

export function useReceipt(id: string) {
  return usePublicQuery(
    `receipt:${id}`,
    (client) => client.get(publicReceiptSchema, platformPaths.receipt(id)),
    { enabled: Boolean(id) },
  );
}

export function useAdminUsers(filters?: { role?: string; search?: string }) {
  const key = `admin-users:${filters?.role ?? ""}:${filters?.search ?? ""}`;
  return useClientQuery(key, (client) =>
    fetchAllPages(client, adminUserSchema, platformPaths.adminUsers(), filters),
  );
}
