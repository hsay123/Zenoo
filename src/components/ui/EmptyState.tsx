import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Empty state.
 *
 * The product specification is explicit: empty states must honestly
 * explain how to start, and must never invent metrics or activity. Every
 * empty state here therefore describes the next real action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface/60 text-center",
        compact ? "gap-3 px-6 py-10" : "gap-4 px-6 py-16",
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-3"
        >
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <h3 className="text-title text-ink">{title}</h3>
      <p className="max-w-md text-body-sm text-ink-3">{description}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
