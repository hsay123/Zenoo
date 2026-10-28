import { cn } from "@/lib/utils/cn";

/**
 * Horizontal progress bar.
 *
 * Accepts labelled segments so a bar can show accepted / in review /
 * remaining without relying on colour alone — each segment is paired with
 * a legend in the consuming table.
 */
export function Progress({
  value,
  max,
  tone = "accent",
  className,
  label,
}: {
  value: number;
  max: number;
  tone?: "accent" | "success" | "pending" | "neutral";
  className?: string;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tones = {
    accent: "bg-accent-500",
    success: "bg-success-fg",
    pending: "bg-pending-fg",
    neutral: "bg-ink-4",
  } as const;

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div
        className={cn("h-full rounded-full", tones[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
