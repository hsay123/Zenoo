import { useCases } from "@/lib/content/landing";
import { MediaPlaceholder } from "@/components/media/MediaPlaceholder";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils/cn";

/**
 * Machine-learning use cases — Encord Bento Box Style.
 *
 * Four bento box cards in a 2-column grid layout with media at top,
 * title and description below, and tags at bottom.
 */
export function UseCases() {
  return (
    <Section tone="canvas" spacing="default" divider contained={false}>
      <Container size="wide">
        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-24 max-w-3xl mx-auto">
          <p className="eyebrow justify-center text-[#666666]">
            <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[#CCFF00]" />
            {useCases.eyebrow}
          </p>
          <h2 className="mt-6 text-display-lg text-[#000000] font-bold tracking-[-0.04em] leading-[1.0] max-w-2xl mx-auto">
            {useCases.heading}
          </h2>
          <p className="mt-6 text-body-lg text-[#333333] max-w-2xl mx-auto leading-relaxed">
            {useCases.support}
          </p>
        </div>

        {/* Bento Grid - 2 Column Layout */}
        <ul className="mt-12 grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-2 max-w-[1400px] mx-auto">
          {useCases.items.map((item, index) => (
            <li
              key={item.id}
              id={item.id}
              className="bento-card flex flex-col min-h-[420px]"
            >
              <div className="flex flex-col h-full">
                <div className="relative aspect-video lg:aspect-[4/3] rounded-xl overflow-hidden mb-8">
                  <MediaPlaceholder
                    asset={item.asset}
                    tone="light"
                    sizes="(min-width: 1024px) 700px, 100vw"
                  />
                </div>
                <div className="flex flex-1 flex-col">
                  <h3 className="text-2xl lg:text-3xl font-bold text-[#000000] tracking-[-0.02em] mb-4">
                    {item.title}
                  </h3>
                  <p className="text-[#333333] leading-relaxed flex-1 mb-6">
                    {item.body}
                  </p>
                  <ul className="mt-auto flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full border border-[#E0E0E0] bg-white px-3 py-1 text-sm font-medium text-[#333333]"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}