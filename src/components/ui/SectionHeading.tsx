import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Eyebrow({
  children,
  tone = "light",
  className,
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "eyebrow",
        tone === "dark" ? "text-night-ink-2" : "text-ink-3",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-1 w-1 rounded-full",
          tone === "dark" ? "bg-accent-400" : "bg-accent-600",
        )}
      />
      {children}
    </p>
  );
}

/**
 * Standard editorial section heading: optional eyebrow, a display-size
 * title at a controlled measure, and optional supporting copy and action.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  tone = "light",
  align = "start",
  size = "lg",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "light" | "dark";
  align?: "start" | "center";
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        align === "center" ? "items-center text-center" : "items-start",
        className,
      )}
    >
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2
        className={cn(
          size === "lg" ? "text-display-lg" : "text-display-md",
          tone === "dark" ? "text-night-ink" : "text-ink",
          align === "center" ? "max-w-3xl" : "max-w-2xl",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "text-body-lg",
            tone === "dark" ? "text-night-ink-2" : "text-ink-2",
            align === "center" ? "max-w-2xl" : "measure",
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
