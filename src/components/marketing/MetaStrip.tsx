import type { ReactNode } from "react";

/**
 * Short fact row under a page intro. Renders label/value pairs on a
 * single divided rail so an inner page states its key parameters up top.
 */
export function MetaStrip({
  items,
}: {
  items: readonly { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-caption uppercase tracking-[0.08em] text-ink-4">
            {item.label}
          </dt>
          <dd className="mt-1.5 font-display text-[0.9375rem] font-medium text-ink">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
