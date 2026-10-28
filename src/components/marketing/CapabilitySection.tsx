import type { Capability } from "@/lib/content/landing";
import { MediaPlaceholder } from "@/components/media/MediaPlaceholder";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/SectionHeading";

/**
 * Capability section — Encord Bento Box Style.
 *
 * Single bento box card for each capability.
 */
export function CapabilitySection({
  capability,
  tone,
}: {
  capability: Capability;
  tone: "canvas" | "surface";
}) {
  return (
    <Section
      tone={tone}
      spacing="default"
      id={capability.id}
      className="scroll-mt-28"
      divider={tone === "surface"}
    >
      <div className="max-w-5xl mx-auto">
        <div className="bento-card min-h-[400px]">
          <div className="flex flex-col h-full">
            <div className="relative aspect-video lg:aspect-video lg:h-[300px] rounded-xl overflow-hidden mb-8">
              <MediaPlaceholder
                asset={capability.asset}
                tone="light"
                sizes="(min-width: 1024px) 700px, 100vw"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <div className="flex-1">
                <Eyebrow>
                  {capability.index} — {capability.eyebrow}
                </Eyebrow>
                <h3 className="mt-4 text-2xl lg:text-3xl font-bold text-[#000000] tracking-[-0.02em] mb-4">
                  {capability.heading}
                </h3>
                <p className="text-[#333333] leading-relaxed mb-6">
                  {capability.body}
                </p>
                <ul className="space-y-3 text-[#333333] mb-8">
                  {capability.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-[#333333]">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#CCFF00] shrink-0" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <a href="#" className="mt-auto text-sm font-medium text-[#CCFF00] hover:text-[#B8E600] inline-flex items-center gap-1.5">
                Learn more
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}