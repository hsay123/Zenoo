import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Header for a workspace screen: a title, one-line purpose, optional
 * actions and optional meta row. Kept separate from the marketing
 * `PageIntro` because the product area is denser and action-first.
 */
export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        {eyebrow ? (
          <p className="text-eyebrow uppercase text-ink-4">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1.5 font-display text-[1.75rem] font-medium tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-body-sm text-ink-3">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * A single metric tile.
 *
 * `value` is a string so callers decide how to render "not enough data".
 * `hint` carries the definition or sample size — metrics are never shown
 * as a bare number without context.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "muted";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line p-4",
        tone === "muted" ? "bg-surface-muted" : "bg-surface",
        className,
      )}
    >
      <p className="text-caption uppercase tracking-[0.06em] text-ink-4">
        {label}
      </p>
      <p className="mt-2 font-display text-[1.5rem] font-medium tracking-[-0.02em] text-ink tnum">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-caption text-ink-3">{hint}</p> : null}
    </div>
  );
}
