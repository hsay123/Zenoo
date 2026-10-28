import type { Metadata } from "next";
import { capabilities } from "@/lib/content/landing";
import { CapabilityIntro } from "@/components/marketing/CapabilityIntro";
import { CapabilitySection } from "@/components/marketing/CapabilitySection";
import { CredibilityStrip } from "@/components/marketing/CredibilityStrip";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { FeatureBento } from "@/components/marketing/FeatureBento";
import { Hero } from "@/components/marketing/Hero";
import { LogoMarquee } from "@/components/marketing/LogoMarquee";
import { ProductShowcase } from "@/components/marketing/ProductShowcase";
import { TrustProvenance } from "@/components/marketing/TrustProvenance";
import { UseCases } from "@/components/marketing/UseCases";
import { WorkflowSequence } from "@/components/marketing/WorkflowSequence";

export const metadata: Metadata = {
  title: "The data infrastructure for intelligent machines",
  description:
    "Zeno turns rights-cleared image and video data into structured, reviewed annotation and training-ready datasets — with versioned records and a traceable path from source media to accepted delivery.",
};

/**
 * Landing page.
 *
 * Section order follows the narrative: attention → credibility →
 * capability → mechanism → fit → product → trust → questions → close.
 * Tonal bands alternate so no two adjacent sections share a surface.
 */
export default function HomePage() {
  const tones: Array<"canvas" | "surface"> = ["surface", "canvas", "surface"];

  return (
    <>
      <Hero />
      <LogoMarquee />
      {/* Legacy Workflow Coverage section - hidden via CSS */}
      <div className="hidden">
        <CredibilityStrip />
      </div>
      {/* New Bento Box feature section with video */}
      <FeatureBento />
      <CapabilityIntro />
      {capabilities.map((capability, index) => (
        <CapabilitySection
          key={capability.id}
          capability={capability}
          tone={tones[index] ?? "canvas"}
        />
      ))}
      <WorkflowSequence />
      <UseCases />
      <ProductShowcase />
      <TrustProvenance />
      <Faq />
      <FinalCta />
    </>
  );
}