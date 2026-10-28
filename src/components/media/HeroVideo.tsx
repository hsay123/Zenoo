"use client";

import { useState, useSyncExternalStore } from "react";
import type { MediaAsset } from "@/lib/media/assets";
import { cn } from "@/lib/utils/cn";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduceMotion(callback: () => void) {
  const media = window.matchMedia(REDUCE_MOTION_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/**
 * Hero video layer.
 *
 * Requirements handled here:
 *   • muted, looped, `playsInline` so autoplay is permitted everywhere
 *   • poster frame while the file loads
 *   • respects `prefers-reduced-motion` — the poster is shown instead of
 *     playing, and the video element never starts
 *   • graceful failure — if playback errors, the poster remains
 *   • no text baked into the video; captions and CTAs are HTML above it
 *
 * Swapping in a real asset requires no markup changes elsewhere.
 */
export function HeroVideo({
  asset,
  className,
  priority = true,
}: {
  asset: MediaAsset;
  className?: string;
  priority?: boolean;
}) {
  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    () => window.matchMedia(REDUCE_MOTION_QUERY).matches,
    () => false,
  );
  const [failed, setFailed] = useState(false);

  if (!asset.src || failed) return null;

  return (
    <video
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      poster={asset.poster ?? undefined}
      muted
      loop
      playsInline
      autoPlay={!reduceMotion}
      preload={priority ? "auto" : "metadata"}
      onError={() => setFailed(true)}
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src={asset.src} type="video/mp4" />
    </video>
  );
}
