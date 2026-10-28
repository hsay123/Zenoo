import Image from "next/image";
import type { ReactNode } from "react";
import type { MediaAsset } from "@/lib/media/assets";
import { cn } from "@/lib/utils/cn";
import { TechnicalBackdrop } from "./TechnicalBackdrop";

/**
 * Media surface with a fixed aspect ratio.
 *
 * Two states, one component:
 *   • `asset.src` unset → an intentional placeholder that names the file to
 *     supply, so the replacement target is unmistakable.
 *   • `asset.src` set   → a real responsive `<Image>` with the same box
 *     dimensions, so swapping assets causes no layout shift or redesign.
 *
 * The wrapper always reserves space via `aspect-ratio`, which is what
 * keeps cumulative layout shift at zero whether or not media exists.
 */
export function MediaPlaceholder({
  asset,
  tone = "dark",
  className,
  sizes = "(min-width: 1024px) 640px, 100vw",
  priority = false,
  children,
  /** Small corner chip naming the expected file. */
  showAssetPath = true,
  caption,
}: {
  asset: MediaAsset;
  tone?: "light" | "dark";
  className?: string;
  sizes?: string;
  priority?: boolean;
  children?: ReactNode;
  showAssetPath?: boolean;
  caption?: string;
}) {
  const hasAsset = asset.src !== null;
  const dark = tone === "dark";

  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-xl border",
        dark ? "border-night-3 bg-night" : "border-line bg-surface-muted",
        className,
      )}
      style={{ aspectRatio: asset.aspect }}
    >
      {hasAsset ? (
        <Image
          src={asset.src as string}
          alt={asset.alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0" role="img" aria-label={asset.description}>
          {dark ? <div className="bg-grid-dark absolute inset-0" /> : null}
          {!dark ? <div className="bg-grid absolute inset-0 opacity-60" /> : null}
          <TechnicalBackdrop tone={tone} />

          {/* Replacement target — the whole point of the placeholder. */}
          <span
            className={cn(
              "absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4",
              "bg-gradient-to-t",
              dark
                ? "from-night/85 via-night/40 to-transparent"
                : "from-surface-muted/95 via-surface-muted/60 to-transparent",
            )}
          >
            <span
              className={cn(
                "rounded-md border px-2.5 py-1 text-caption font-medium backdrop-blur-sm",
                dark
                  ? "border-line-inverse bg-white/8 text-night-ink-2"
                  : "border-line-strong bg-surface/80 text-ink-2",
              )}
            >
              {asset.description}
            </span>
            {showAssetPath ? (
              <code
                className={cn(
                  "hidden shrink-0 rounded-md border px-2.5 py-1 font-mono text-[11px] sm:inline-block",
                  dark
                    ? "border-line-inverse bg-white/8 text-night-ink-3"
                    : "border-line-strong bg-surface/80 text-ink-4",
                )}
              >
                {asset.expectedPath}
              </code>
            ) : null}
          </span>
        </div>
      )}

      {children}

      {caption ? (
        <figcaption
          className={cn(
            "absolute left-4 top-4 rounded-md border px-2.5 py-1 text-caption font-medium backdrop-blur-sm",
            dark
              ? "border-line-inverse bg-night/70 text-night-ink-2"
              : "border-line-strong bg-surface/85 text-ink-2",
          )}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
