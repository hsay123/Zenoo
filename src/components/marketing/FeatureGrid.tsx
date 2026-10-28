import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Check } from "@/components/ui/icons";

export type FeatureItem = {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  /** Optional short qualifier, e.g. a status or phase label. */
  note?: string;
};

/**
 * Hairline-divided feature grid.
 *
 * Uses rules rather than nested cards so a page can carry several
 * concept groups without reading as a deck of boxes. Each item keeps an
 * icon, a label and a sentence — never an icon alone.
 */
export function FeatureGrid({
  items,
  columns = 3,
  className,
}: {
  items: FeatureItem[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid border-t border-line",
        columns === 3
          ? "sm:grid-cols-2 lg:grid-cols-3"
          : "sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li
            key={item.title}
            className={cn(
              "border-b border-line py-7",
              columns === 3
                ? "sm:[&:nth-child(odd)]:pr-8 sm:[&:nth-child(even)]:pl-8 lg:border-l lg:px-8 lg:first:border-l-0 lg:first:pl-0"
                : "sm:[&:nth-child(even)]:pl-8 lg:px-8 lg:first:pl-0",
            )}
          >
            <div className="flex items-center gap-3">
              {Icon ? (
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-accent-600"
                >
                  <Icon className="h-4 w-4" />
                </span>
              ) : (
                <Check aria-hidden className="h-4 w-4 shrink-0 text-accent-600" />
              )}
              <h3 className="font-display text-title text-ink">{item.title}</h3>
            </div>
            <p className="mt-3 text-body-sm text-ink-3">{item.body}</p>
            {item.note ? (
              <p className="mt-3 text-caption text-ink-4">{item.note}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
