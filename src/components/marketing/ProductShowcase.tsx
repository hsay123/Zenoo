import { productShowcase } from "@/lib/content/landing";
import { MediaPlaceholder } from "@/components/media/MediaPlaceholder";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * Product visual section — Encord Bento Box Style.
 *
 * Large featured card with media, followed by a 3-column grid of feature cards.
 */
export function ProductShowcase() {
  return (
    <Section tone="canvas" spacing="default" contained={false}>
      <Container size="wide">
        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-24 max-w-3xl mx-auto">
          <p className="eyebrow justify-center text-[#666666]">
            <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[#CCFF00]" />
            {productShowcase.eyebrow}
          </p>
          <h2 className="mt-6 text-display-lg text-[#000000] font-bold tracking-[-0.04em] leading-[1.0] max-w-2xl mx-auto">
            {productShowcase.heading}
          </h2>
          <p className="mt-6 text-body-lg text-[#333333] max-w-2xl mx-auto leading-relaxed">
            {productShowcase.support}
          </p>
        </div>

        {/* Bento Grid - Large Featured Card (2-col span) + 3 Column Grid */}
        <div className="grid gap-6 lg:gap-8 lg:grid-cols-2 lg:max-w-5xl mx-auto">
          {/* Large Featured Card - Full Width (spans 2 cols on lg) */}
          <div className="bento-card lg:col-span-2 relative overflow-hidden">
            <div className="relative aspect-video lg:aspect-video lg:h-[400px] rounded-xl overflow-hidden">
              <MediaPlaceholder
                asset={productShowcase.asset}
                tone="dark"
                sizes="(min-width: 1280px) 1200px, 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            </div>
            <div className="absolute bottom-8 left-8 right-8 lg:bottom-12 lg:left-12 lg:right-12 text-white">
              <h3 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em] mb-4">
                {productShowcase.heading}
              </h3>
              <p className="text-white/90 max-w-xl leading-relaxed">
                {productShowcase.support}
              </p>
            </div>
          </div>

          {/* 3-Column Feature Grid */}
          <ul className="grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-3 max-w-[1400px] mx-auto lg:col-span-2">
            {productShowcase.points.map((point) => (
              <li key={point.title} className="bento-card flex flex-col min-h-[280px]">
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="text-xl lg:text-2xl font-bold text-[#000000] tracking-[-0.01em] mb-4">
                      {point.title}
                    </h3>
                    <p className="text-[#333333] leading-relaxed">
                      {point.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}