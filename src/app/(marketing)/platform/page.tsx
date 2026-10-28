import type { Metadata } from "next";
import { capabilities } from "@/lib/content/landing";
import { platformPage } from "@/lib/content/pages";
import { media } from "@/lib/media/assets";
import { CapabilitySection } from "@/components/marketing/CapabilitySection";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { MetaStrip } from "@/components/marketing/MetaStrip";
import { PageIntro } from "@/components/marketing/PageIntro";
import { MediaPlaceholder } from "@/components/media/MediaPlaceholder";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  AlertTriangle,
  Check,
  FileText,
  Layers,
  Receipt,
  Scale,
  ShieldCheck,
  Sparkle,
} from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "One workflow for quality-assured image and video data: schema validation, independent review, provenance and deterministic exports.",
};

const qualityIcons = [ShieldCheck, Sparkle, Scale, Layers, AlertTriangle, FileText];

export default function PlatformPage() {
  return (
    <>
      <PageIntro
        eyebrow={platformPage.eyebrow}
        title={platformPage.title}
        lead={platformPage.lead}
        actions={
          <>
            <ButtonLink href="/signup" size="lg">
              Get started
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" size="lg">
              See the lifecycle
            </ButtonLink>
          </>
        }
        meta={<MetaStrip items={platformPage.meta} />}
      />

      {/* Workflow — id anchors: #annotate, #review, #deliver */}
      {capabilities.map((capability, index) => (
        <CapabilitySection
          key={capability.id}
          capability={capability}
          tone={index % 2 === 0 ? "canvas" : "surface"}
        />
      ))}

      {/* Quality system — #quality */}
      <Section
        id="quality"
        tone="muted"
        spacing="default"
        className="scroll-mt-28"
      >
        <SectionHeading
          eyebrow={platformPage.quality.eyebrow}
          title={platformPage.quality.heading}
          description={platformPage.quality.support}
        />

        <div className="mt-12">
          <FeatureGrid
            items={platformPage.quality.items.map((item, index) => ({
              ...item,
              icon: qualityIcons[index] ?? Check,
            }))}
          />
        </div>

        <div className="mt-12 rounded-xl border border-line bg-surface p-6 sm:p-8">
          <h3 className="font-display text-display-sm text-ink">
            {platformPage.quality.metrics.title}
          </h3>
          <p className="mt-3 measure text-body-sm text-ink-3">
            {platformPage.quality.metrics.body}
          </p>
          <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {platformPage.quality.metrics.sample.map((metric) => (
              <li key={metric.key} className="border-t border-line pt-4">
                <p className="font-mono text-[12px] text-accent-700">
                  {metric.key}
                </p>
                <p className="mt-1.5 font-display text-title text-ink">
                  {metric.label}
                </p>
                <p className="mt-1 text-body-sm text-ink-3">{metric.definition}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Provenance — #provenance */}
      <Section
        id="provenance"
        tone="canvas"
        spacing="default"
        divider
        className="scroll-mt-28"
      >
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow={platformPage.provenance.eyebrow}
              title={platformPage.provenance.heading}
              description={platformPage.provenance.support}
            />
            <ul className="mt-8 space-y-3">
              {platformPage.provenance.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2.5 text-body-sm text-ink-2"
                >
                  <Check
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                  />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Badge tone="outline">Off-chain by default</Badge>
            </div>
          </div>

          <div className="lg:col-span-7">
            <MediaPlaceholder
              asset={media.provenanceDiagram}
              tone="light"
              sizes="(min-width: 1024px) 700px, 100vw"
            />
          </div>
        </div>
      </Section>

      {/* Export — #export */}
      <Section
        id="export"
        tone="surface"
        spacing="default"
        divider
        className="scroll-mt-28"
      >
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow={platformPage.export.eyebrow}
              title={platformPage.export.heading}
              description={platformPage.export.support}
            />
            <p className="mt-6 flex items-start gap-2.5 text-body-sm text-ink-3">
              <Receipt aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
              {platformPage.export.access}
            </p>
          </div>

          <div className="lg:col-span-7">
            <MediaPlaceholder
              asset={media.datasetExport}
              tone="dark"
              sizes="(min-width: 1024px) 700px, 100vw"
            />
            <ul className="mt-6 border-t border-line">
              {platformPage.export.files.map((file) => (
                <li
                  key={file.name}
                  className="flex flex-col gap-1 border-b border-line py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <code className="font-mono text-[13px] text-ink">
                    {file.name}
                  </code>
                  <span className="text-caption text-ink-3 sm:text-right">
                    {file.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Boundaries */}
      <Section tone="canvas" spacing="default" divider>
        <SectionHeading
          eyebrow={platformPage.boundaries.eyebrow}
          title={platformPage.boundaries.heading}
          description={platformPage.boundaries.support}
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h3 className="flex items-center gap-2 font-display text-title text-ink">
              <Check aria-hidden className="h-4 w-4 text-success-fg" />
              In scope today
            </h3>
            <ul className="mt-5 border-t border-line">
              {platformPage.boundaries.inScope.map((item) => (
                <li
                  key={item}
                  className="border-b border-line py-3.5 text-body-sm text-ink-2"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 font-display text-title text-ink">
              <AlertTriangle aria-hidden className="h-4 w-4 text-pending-fg" />
              Not in this release
            </h3>
            <ul className="mt-5 border-t border-line">
              {platformPage.boundaries.outOfScope.map((item) => (
                <li
                  key={item}
                  className="border-b border-line py-3.5 text-body-sm text-ink-3"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 text-caption text-ink-4">
          Planned items are listed as future scope, never as current
          capability. Marquee features that are not built are not advertised.
        </p>
      </Section>

      <div className="border-t border-line">
        <Container size="default" className="py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-display-sm text-ink">
                Ready to scope a pilot?
              </h2>
              <p className="mt-2 measure text-body-sm text-ink-3">
                One schema, one rights-cleared dataset, measured results before
                scaling.
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <ButtonLink href="/contact" size="lg">
                Contact us
              </ButtonLink>
              <ButtonLink href="/explore" variant="secondary" size="lg">
                Explore product
              </ButtonLink>
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
