import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "dark" | "outline";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-muted text-ink-2 border-line",
    accent: "bg-accent-50 text-accent-800 border-accent-200",
    dark: "bg-white/8 text-night-ink-2 border-line-inverse",
    outline: "bg-transparent text-ink-3 border-line-strong",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Surface primitive. One radius step for every card on the site keeps
 * the geometry consistent; `interactive` only adds a hover affordance
 * where the card is genuinely a link.
 */
export function Card({
  children,
  className,
  as: Tag = "div",
  interactive = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article" | "section";
  interactive?: boolean;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-lg border border-line bg-surface",
        interactive &&
          "transition-colors duration-200 hover:border-line-strong hover:bg-surface",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
