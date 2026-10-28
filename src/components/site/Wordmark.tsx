import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Official Zeno logo component.
 *
 * Uses the official Zeno logo asset. The logo contains the icon and wordmark
 * together. When used in the header, we display the logo icon alongside the
 * "Zeno" text for consistency with the existing design system.
 */
export function WordmarkGlyph({
  className,
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex h-7 w-auto items-center justify-center",
        className,
      )}
    >
      <Image
        src="/zeno-logo.png"
        alt=""
        aria-hidden="true"
        className="h-7 w-auto object-contain"
        width={28}
        height={28}
      />
    </span>
  );
}

export function Wordmark({
  tone = "light",
  className,
  href = "/workspace",
}: {
  tone?: "light" | "dark";
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Zeno — home"
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none",
        className,
      )}
    >
      <WordmarkGlyph />
      <span
        className={cn(
          "font-display text-[1.0625rem] font-medium tracking-[-0.02em]",
          tone === "dark" ? "text-white" : "text-ink",
        )}
      >
        Zeno
      </span>
    </Link>
  );
}