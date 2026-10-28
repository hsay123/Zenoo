"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/api/session";
import { asPlatformError, type QueryState } from "@/lib/api/live";
import { type PlatformError } from "@/lib/api/platform";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Info, Lock } from "@/components/ui/icons";

/**
 * Async state primitives.
 *
 * Product screens render live API data, so every one of them has four
 * possible outcomes: loading, empty, unauthorized/forbidden, and error.
 * These components render those honestly — a failure is shown as a failure,
 * never as an empty list.
 */

export function LoadingBlock({
  label = "Loading…",
}: {
  label?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-body-sm text-ink-3">{label}</p>
      <div className="mt-4 space-y-2.5" aria-hidden>
        <div className="h-3 w-2/5 animate-pulse rounded-full bg-surface-sunken" />
        <div className="h-3 w-4/5 animate-pulse rounded-full bg-surface-sunken" />
        <div className="h-3 w-3/5 animate-pulse rounded-full bg-surface-sunken" />
      </div>
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useSession();
  return (
    <Button variant="ghost" size="sm" onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}

export function ErrorBlock({ error }: { error: PlatformError }) {
  const title =
    error.code === "UNAUTHORIZED"
      ? "Your session is no longer valid"
      : error.code === "FORBIDDEN"
        ? "You don't have access to this"
        : "We couldn't load this";
  return (
    <div className="rounded-xl border border-danger-line bg-danger-bg p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-danger-line bg-surface text-danger-fg">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-title text-ink">{title}</h2>
          <p className="mt-1.5 text-body-sm text-ink-3">
            <code className="font-mono text-[12px]">{error.code}</code> —{" "}
            {error.message}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
            {error.code === "UNAUTHORIZED" ? <SignOutButton /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InlineError({ error }: { error: PlatformError | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-bg px-3.5 py-2.5 text-body-sm text-danger-fg"
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <code className="font-mono text-[12px]">{error.code}</code> — {error.message}
      </span>
    </p>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-line bg-surface p-4 text-caption text-ink-3">
      <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Dispatch a query's four states. `empty` is only used when `isEmpty`
 * returns true for the resolved data.
 */
export function QueryView<T>({
  query,
  children,
  isEmpty,
  empty,
  loadingLabel,
}: {
  query: QueryState<T> & { reload: () => void };
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingLabel?: string;
}) {
  if (query.status === "loading") return <LoadingBlock label={loadingLabel} />;
  if (query.status === "error") return <ErrorBlock error={query.error} />;
  if (empty && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

/** Type-narrowing helper for components that only have a thrown value. */
export function toPlatformError(cause: unknown): PlatformError {
  return asPlatformError(cause);
}
