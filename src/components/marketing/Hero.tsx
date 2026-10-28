"use client";

import { hero } from "@/lib/content/landing";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Hero — Encord Style.
 *
 * Constrained container with rounded corners, video background,
 * dark overlay, and centered content with single Lime Green CTA.
 * Optimized height to fit above the fold with logo marquee visible.
 * Added top spacing for breathing room below navbar.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-2 pt-2 sm:pb-4 sm:pt-4 lg:pb-6 lg:pt-4" style={{ marginBottom: '1rem !important', paddingTop: '2.5rem !important' }}>
      {/* Constrained Hero Container with Rounded Corners — Fixed Height for Above-Fold */}
      <div className="relative z-10 mx-auto max-w-[1400px] rounded-2xl overflow-hidden bg-black max-h-[560px]">
        {/* Video Background */}
        <div className="absolute inset-0 z-0">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          >
            <source src="/landingpage.mp4" type="video/mp4" />
          </video>
          {/* Dark Overlay for text readability */}
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-5 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center py-8 sm:py-10 lg:py-12">
            <p className="eyebrow justify-center text-white/80">
              <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[#CCFF00]" />
              {hero.eyebrow}
            </p>

            <h1 className="mt-4 text-display-xl text-white leading-[0.95] tracking-[-0.045em] font-bold">
              {hero.headline}
            </h1>

            <p className="mt-4 max-w-2xl text-body-lg text-white/90 leading-relaxed">
              {hero.support}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <ButtonLink href={hero.primary.href} size="lg">
                {hero.primary.label}
                <svg className="h-5 w-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4" />
                </svg>
              </ButtonLink>
              {/* Secondary button hidden per spec */}
              <ButtonLink
                href={hero.secondary.href}
                variant="secondary"
                size="lg"
                className="hidden"
              >
                {hero.secondary.label}
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>

      {/* Feature highlights strip — HIDDEN per spec to remove green checkmark artifacts */}
      <ul className="hidden mt-16 grid gap-x-8 gap-y-6 border-t border-white/20 pt-10 sm:grid-cols-2 lg:grid-cols-4">
        {[
          "Rights-cleared video only",
          "Independent human review",
          "Versioned accepted records",
          "JSONL and CSV export",
        ].map((item) => (
          <li key={item} className="flex items-center gap-3">
            <svg
              aria-hidden
              className="h-5 w-5 shrink-0 text-[#CCFF00]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-body-sm text-white/90">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}