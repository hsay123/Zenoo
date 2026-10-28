import { workflow } from "@/lib/content/landing";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { BentoCard } from "@/components/ui/BentoCard";

/**
 * Unified workflow — Encord Bento Box Style.
 *
 * Three-column bento grid where each step is a unified card with
 * light gray background, icon/number at the top, and text at the bottom.
 */
export function WorkflowSequence() {
  return (
    <Section tone="canvas" spacing="default" contained={false}>
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-10">
        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-24 max-w-3xl mx-auto">
          <p className="eyebrow justify-center text-[#666666]">
            <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[#CCFF00]" />
            {workflow.eyebrow}
          </p>
          <h2 className="mt-6 text-display-lg text-[#000000] font-bold tracking-[-0.04em] leading-[1.0] max-w-2xl mx-auto">
            {workflow.heading}
          </h2>
          <p className="mt-6 text-body-lg text-[#333333] max-w-2xl mx-auto leading-relaxed">
            {workflow.support}
          </p>
        </div>

        {/* Bento Grid - 3 Column Layout */}
        <div className="grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-3 max-w-[1400px] mx-auto">
          {workflow.steps.map((step, index) => (
            <div
              key={step.id}
              className="bento-card flex flex-col min-h-[380px]"
            >
              <div className="flex flex-col h-full">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-[#E0E0E0] bg-white font-mono text-base font-semibold text-[#333333] tnum">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-bold text-[#000000] tracking-[-0.02em] mb-4">
                    {step.label}
                  </h3>
                  <p className="text-[#333333] leading-relaxed mb-6">
                    {step.detail}
                  </p>
                </div>
                <div className="mt-auto">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E0E0E0] bg-white text-sm font-medium text-[#333333]">
                    {step.state}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}