import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Long-form legal/editorial copy.
 *
 * Styles bare HTML so the legal pages stay readable and semantically
 * correct without a prose plugin dependency.
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "measure text-body text-ink-2",
        "[&_h2]:mt-12 [&_h2]:text-display-sm [&_h2]:text-ink",
        "[&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-title [&_h3]:text-ink",
        "[&_p]:mt-4",
        "[&_ul]:mt-4 [&_ul]:space-y-2 [&_ul]:pl-5",
        "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
        "[&_li]:marker:text-ink-4",
        "[&_a]:text-accent-700 [&_a]:underline [&_a]:decoration-accent-300 [&_a]:underline-offset-2 hover:[&_a]:decoration-accent-600",
        "[&_strong]:font-medium [&_strong]:text-ink",
        "[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-accent-700",
        "[&_hr]:my-10 [&_hr]:border-line",
        "[&_table]:mt-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-body-sm",
        "[&_th]:border-b [&_th]:border-line-strong [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink",
        "[&_td]:border-b [&_td]:border-line [&_td]:py-2 [&_td]:align-top",
        className,
      )}
    >
      {children}
    </div>
  );
}
