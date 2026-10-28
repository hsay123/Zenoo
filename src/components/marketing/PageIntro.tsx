import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/utils/cn";

/**
 * Standard page header for the secondary marketing routes.
 *
 * Deliberately lighter than the homepage hero: no media well, one accent
 * wash, and a single column so every inner page opens with the same
 * rhythm and the copy always carries the page.
 */
export function PageIntro({
  eyebrow,
  title,
  lead,
  actions,
  meta,
  className,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Short supporting facts, rendered as a divided row under the lead. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden border-b border-line", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(101,71,228,0.09),transparent_70%)]"
      />
      <Container size="default" className="relative pb-14 pt-14 sm:pb-16 sm:pt-20">
        <div className="max-w-3xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-5 text-display-lg text-ink">{title}</h1>
          {lead ? (
            <div className="mt-6 measure text-body-lg text-ink-2">{lead}</div>
          ) : null}
          {actions ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {actions}
            </div>
          ) : null}
        </div>

        {meta ? (
          <div className="mt-12 border-t border-line pt-6 sm:mt-14">{meta}</div>
        ) : null}
      </Container>
    </section>
  );
}
