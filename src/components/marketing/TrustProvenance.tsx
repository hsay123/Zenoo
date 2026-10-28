import type { ComponentType, SVGProps } from "react";
import { trust } from "@/lib/content/landing";
import { media } from "@/lib/media/assets";
import { MediaPlaceholder } from "@/components/media/MediaPlaceholder";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Check, Layers, Lock, Receipt, Scale } from "@/components/ui/icons";
import { BentoCard } from "@/components/ui/BentoCard";

const iconMap: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  layers: Layers,
  scale: Scale,
  receipt: Receipt,
  lock: Lock,
  check: Check,
};

/**
 * Trust and provenance — Encord Dark Mode Bento Box Style.
 *
 * Pure black background with white text and lime green accents.
 * Bento box cards for each trust artifact.
 */
export function TrustProvenance() {
  return (
    <Section tone="night" spacing="default">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-10">
        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-24 max-w-3xl mx-auto">
          <p className="eyebrow justify-center text-white/70">
            <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[#CCFF00]" />
            {trust.eyebrow}
          </p>
          <h2 className="mt-6 text-display-lg text-white font-bold tracking-[-0.04em] leading-[1.0] max-w-2xl mx-auto">
            {trust.heading}
          </h2>
          <p className="mt-6 text-body-lg text-white/80 max-w-2xl mx-auto leading-relaxed">
            {trust.support}
          </p>
        </div>

        {/* Bento Grid - 2 Column Layout */}
        <div className="grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-2 max-w-[1400px] mx-auto">
          {/* Featured Card with Diagram */}
          <div className="bento-card lg:col-span-2 relative overflow-hidden bg-[#0A0A0A]">
            <div className="relative aspect-video lg:aspect-video lg:h-[350px] rounded-xl overflow-hidden mb-8">
              <MediaPlaceholder
                asset={media.provenanceDiagram}
                tone="dark"
                sizes="(min-width: 1024px) 520px, 100vw"
              />
            </div>
            <div className="p-8 lg:p-12 lg:pt-16 lg:pb-12 lg:pl-16">
              <div className="max-w-2xl">
                <p className="eyebrow text-white/70">{trust.eyebrow}</p>
                <h3 className="mt-4 text-display-md text-white font-bold tracking-[-0.03em] leading-[1.05] mb-4">
                  {trust.heading}
                </h3>
                <p className="text-white/80 max-w-xl leading-relaxed">
                  {trust.support}
                </p>
              </div>
            </div>
          </div>

          {/* Trust Artifact Cards */}
          {trust.items.map((item, index) => {
            const Icon = iconMap[item.icon] ?? Check;
            return (
              <div
                key={item.id}
                className="bento-card bg-[#0A0A0A] border-[#1A1A1A] flex flex-col min-h-[280px]"
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-4 mb-6">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                    >
                      <Icon className="h-5 w-5 text-[#CCFF00]" />
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-[-0.01em]">
                        {item.title}
                      </h3>
                    </div>
                  </div>
                  <p className="text-white/70 leading-relaxed flex-1">
                    {item.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}