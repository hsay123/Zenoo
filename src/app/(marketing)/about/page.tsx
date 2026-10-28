import type { Metadata } from "next";
import { aboutPage } from "@/lib/content/pages";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Info } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "About",
  description:
    "Zeno builds quality-assured data operations for machine learning — managed delivery, inspectable quality and traceable provenance.",
};

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow={aboutPage.eyebrow}
        title={aboutPage.title}
        lead={aboutPage.lead}
        actions={
          <>
            <ButtonLink href="/contact" size="lg">
              Talk to us
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" size="lg">
              How it works
            </ButtonLink>
          </>
        }
      />

      {/* Thesis */}
      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <h2 className="text-display-md text-ink">
                {aboutPage.thesis.heading}
              </h2>
            </div>
            <div className="lg:col-span-7">
              <p className="measure text-body-lg text-ink-2">
                {aboutPage.thesis.body}
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* Principles */}
      <Section tone="surface" spacing="default" divider contained={false}>
        <Container size="default">
          <SectionHeading
            eyebrow="Principles"
            title="How we make decisions."
          />
          <ul className="mt-12 grid gap-x-12 gap-y-10 border-t border-line pt-2 sm:grid-cols-2">
            {aboutPage.principles.map((principle) => (
              <li key={principle.title} className="border-b border-line py-6">
                <h3 className="font-display text-title text-ink">
                  {principle.title}
                </h3>
                <p className="mt-3 measure text-body-sm text-ink-3">
                  {principle.body}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Stage + roadmap */}
      <Section tone="canvas" spacing="default" divider contained={false}>
        <Container size="default">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHeading
                eyebrow="Stage"
                title={aboutPage.stage.heading}
                description={aboutPage.stage.body}
              />
              <div className="mt-8 flex items-start gap-2.5 rounded-lg border border-line bg-surface p-4">
                <Info
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-ink-4"
                />
                <p className="text-body-sm text-ink-3">
                  We are looking for design partners with rights-cleared
                  images and video and a specific labelling need — not for logos.
                </p>
              </div>
            </div>
            <div className="lg:col-span-7">
              <ol className="border-t border-line">
                {aboutPage.roadmap.map((item) => (
                  <li
                    key={item.phase}
                    className="grid gap-2 border-b border-line py-6 sm:grid-cols-[8rem_1fr] sm:gap-6"
                  >
                    <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-accent-700">
                      {item.phase}
                    </span>
                    <span className="text-body-sm text-ink-2">{item.body}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Container>
      </Section>

      <div className="border-t border-line bg-surface">
        <Container size="default" className="py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-display-sm text-ink">
                Build with us.
              </h2>
              <p className="mt-2 measure text-body-sm text-ink-3">
                If you have image and video data and a labelling bottleneck, we would
                like to hear the specifics.
              </p>
            </div>
            <ButtonLink href="/contact" size="lg" className="shrink-0">
              Contact
            </ButtonLink>
          </div>
        </Container>
      </div>
    </>
  );
}
