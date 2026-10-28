import type { MediaAsset } from "@/lib/media/assets";
import { cn } from "@/lib/utils/cn";
import { HeroVideo } from "./HeroVideo";
import { TechnicalBackdrop } from "./TechnicalBackdrop";

/**
 * Hero media slot.
 *
 * Renders a neutral, dark, low-contrast media surface sized to the hero's
 * aspect ratio. When a real asset arrives it renders `<video>` in exactly
 * the same box via `HeroVideo`, so the hero never needs redesigning.
 *
 * Everything overlaid on this slot — headline, supporting copy, CTAs —
 * is HTML rendered by the hero section, not pixels inside the video. The
 * page therefore communicates fully without the media loading.
 */
export function HeroMediaPlaceholder({
  asset,
  className,
}: {
  asset: MediaAsset;
  className?: string;
}) {
  const hasAsset = asset.src !== null;

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-night-3 bg-night",
        className,
      )}
      style={{ aspectRatio: asset.aspect }}
    >
      {/* Ambient depth — restrained, not a decorative gradient wash. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_78%_8%,rgba(101,71,228,0.28),transparent_58%)]"
      />
      <div aria-hidden className="bg-grid-dark absolute inset-0 opacity-70" />

      {hasAsset ? (
        <HeroVideo asset={asset} />
      ) : (
        <>
          {/* Let the backdrop sit slightly larger, like a wide cinematic crop. */}
          <div className="absolute inset-0 scale-[1.04]">
            <TechnicalBackdrop tone="dark" />
          </div>

          {/* Media-slot affordance: states this is a reserved slot for media. */}
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-line-inverse bg-night/70 px-3 py-1.5 backdrop-blur-sm sm:left-6 sm:top-6">
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
            </span>
            <span className="text-caption font-medium text-night-ink-2">
              Hero media slot
            </span>
          </div>

          <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
            <code className="rounded-md border border-line-inverse bg-night/70 px-2.5 py-1 font-mono text-[11px] text-night-ink-3 backdrop-blur-sm">
              {asset.expectedPath}
            </code>
          </div>
        </>
      )}

      {/* Legibility scrim for overlay text. Sits above media, below the
          hero copy, which the hero section renders as siblings. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-night/25"
      />
    </div>
  );
}
