import type { Metadata } from "next";
import { howItWorksPage } from "@/lib/content/pages";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { AlertTriangle, Check, Info } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The end-to-end image and video data lifecycle: source and segment, claim and lease, annotate and validate, review and decide, accept and settle, package and deliver.",
};

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow={howItWorksPage.eyebrow}
        title={howItWorksPage.title}
        lead={howItWorksPage.lead}
        actions={
          <>
            <ButtonLink href="/signup" size="lg">
              Get started
            </ButtonLink>
            <ButtonLink href="/platform" variant="secondary" size="lg">
              Platform details
            </ButtonLink>
          </>
        }
      />

      {/* Lifecycle */}
      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <ol className="relative border-t border-line">
            {howItWorksPage.stages.map((stage) => (
              <li
                key={stage.id}
                id={stage.id}
                className="grid scroll-mt-28 gap-6 border-b border-line py-10 lg:grid-cols-12 lg:gap-12"
              >
                <div className="lg:col-span-1">
                  <span className="font-mono text-[13px] text-accent-700 tnum">
                    {stage.step}
                  </span>
                </div>
                <div className="lg:col-span-5">
                  <h2 className="text-display-sm text-ink">{stage.title}</h2>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {stage.artifacts.map((artifact) => (
                      <li key={artifact}>
                        <Badge tone="outline">{artifact}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lg:col-span-6">
                  <p className="measure text-body text-ink-2">{stage.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* Task state machine */}
      <Section tone="surface" spacing="default" divider contained={false}>
        <Container size="default">
          <SectionHeading
            eyebrow="State"
            title={howItWorksPage.states.title}
            description={howItWorksPage.states.body}
          />

          <ol className="mt-12 flex flex-wrap items-center gap-x-2 gap-y-3">
            {howItWorksPage.states.chain.map((state, index) => (
              <li key={state} className="flex items-center gap-2">
                <span className="rounded-md border border-line-strong bg-canvas px-3 py-1.5 font-mono text-[12px] text-ink-2">
                  {state}
                </span>
                {index < howItWorksPage.states.chain.length - 1 ? (
                  <span aria-hidden className="text-ink-4">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>

          <ul className="mt-10 grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {howItWorksPage.states.notes.map((note) => (
              <li
                key={note}
                className="flex items-start gap-3 border-t border-line pt-4"
              >
                <Info
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                />
                <span className="text-body-sm text-ink-2">{note}</span>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Honesty note */}
      <div className="border-t border-line bg-canvas">
        <Container size="default" className="py-14">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <h2 className="text-display-sm text-ink">
                What stays off-chain, and why.
              </h2>
            </div>
            <div className="lg:col-span-7">
              <p className="measure text-body text-ink-2">
                Videos, personal information, private annotations, reviewer
                notes, customer datasets and application state stay off-chain.
                Only selected funding, settlement and provenance events may be
                recorded, and only when a project enables them.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "A content hash detects that something changed; it does not prove a label is correct.",
                  "A wallet address is not identity verification, skill or Sybil resistance.",
                  "Only a real transaction is shown as a transaction — with its network, recipient and confirmation state.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 h-4 w-4 shrink-0 text-pending-fg"
                    />
                    <span className="text-body-sm text-ink-3">{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center gap-2 rounded-md border border-success-line bg-success-bg px-3 py-2">
                <Check aria-hidden className="h-4 w-4 text-success-fg" />
                <span className="text-body-sm text-success-fg">
                  Claims on this page are limited to what the workflow can
                  actually demonstrate.
                </span>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
