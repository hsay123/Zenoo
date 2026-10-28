import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Container } from "./Container";

/**
 * Vertical rhythm for full-width page bands.
 *
 * `tone` selects the surface treatment; the spacing scale below is what
 * keeps every section on the same cadence.
 */
export type SectionTone = "canvas" | "surface" | "muted" | "night";

const toneClasses: Record<SectionTone, string> = {
  canvas: "bg-canvas text-ink",
  surface: "bg-surface text-ink",
  muted: "bg-surface-muted text-ink",
  night: "bg-night text-night-ink",
};

type SectionProps = {
  tone?: SectionTone;
  /** Vertical padding. `tight` for adjacent bands, `none` when folded into a parent. */
  spacing?: "tight" | "default" | "loose" | "none";
  /** Wrap children in the shared Container. Off when the section manages its own grid. */
  contained?: boolean;
  containerSize?: "default" | "wide" | "prose" | "full";
  divider?: boolean;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">;

const spacingClasses = {
  tight: "py-12 sm:py-16",
  default: "py-16 sm:py-24 lg:py-28",
  loose: "py-24 sm:py-32 lg:py-40",
  none: "",
} as const;

export function Section({
  tone = "canvas",
  spacing = "default",
  contained = true,
  containerSize = "default",
  divider = false,
  children,
  className,
  containerClassName,
  ...rest
}: SectionProps) {
  const inner = contained ? (
    <Container size={containerSize} className={containerClassName}>
      {children}
    </Container>
  ) : (
    children
  );

  return (
    <section
      className={cn(
        "relative",
        toneClasses[tone],
        spacingClasses[spacing],
        divider && "border-t border-line",
        tone === "night" && divider && "border-night-3",
        className,
      )}
      {...rest}
    >
      {inner}
    </section>
  );
}