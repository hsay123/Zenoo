import { Info } from "@/components/ui/icons";

/**
 * Small footnote strip for product screens.
 *
 * Used to state, in place, that a screen's figures are sample data or that
 * a value is intentionally absent. Kept visually quiet so it reads as a
 * footnote rather than an alert.
 */
export function Confirm({ label }: { label: string }) {
  return (
    <p className="mt-6 flex items-start gap-2 text-caption text-ink-4">
      <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </p>
  );
}
