import type { Metadata } from "next";
import Link from "next/link";
import { explorePage } from "@/lib/content/pages";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ArrowRight, Info } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Explore the product",
  description:
    "Walk through the buyer, contributor and reviewer surfaces of Zeno using clearly-labelled sample records.",
};

export default function ExplorePage() {
  const { schema } = explorePage;

  return (
    <>
      <PageIntro
        eyebrow={explorePage.eyebrow}
        title={explorePage.title}
        lead={explorePage.lead}
        actions={
          <>
            <ButtonLink href="/signup" size="lg">
              Create an account
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              Talk to us
            </ButtonLink>
          </>
        }
      />

      {/* Role surfaces */}
      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <ul className="grid gap-6 lg:grid-cols-3">
            {explorePage.surfaces.map((surface) => (
              <li key={surface.to}>
                <Link
                  href={surface.to}
                  className="group flex h-full flex-col rounded-xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
                >
                  <p className="eyebrow">{surface.role}</p>
                  <h2 className="mt-4 font-display text-display-sm text-ink">
                    {surface.title}
                  </h2>
                  <p className="mt-3 flex-1 text-body-sm text-ink-3">
                    {surface.body}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-body-sm font-medium text-accent-700">
                    Open workspace
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-start gap-2.5 rounded-lg border border-line bg-surface-muted p-4">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
            <p className="measure text-caption text-ink-3">
              No platform API is connected in this build, so each workspace runs
              on sample records and labels them as such on every screen. Nothing
              shown represents a real buyer, contributor, payment or settlement.
            </p>
          </div>
        </Container>
      </Section>

      {/* Schema */}
      <Section tone="surface" spacing="default" divider contained={false}>
        <Container size="default">
          <SectionHeading
            eyebrow={schema.eyebrow}
            title={schema.heading}
            description={schema.body}
          />

          <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <ul className="border-t border-line">
                {schema.fields.map((field) => (
                  <li
                    key={field.name}
                    className="grid gap-1 border-b border-line py-4 sm:grid-cols-[11rem_1fr] sm:gap-6"
                  >
                    <code className="font-mono text-[13px] text-ink">
                      {field.name}
                    </code>
                    <span className="text-body-sm text-ink-3">{field.note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-5">
              <div className="space-y-6 rounded-xl border border-line bg-canvas p-6">
                {[
                  { heading: "Action labels", values: schema.labels.actions },
                  { heading: "Outcomes", values: schema.labels.outcomes },
                  { heading: "Failure reasons", values: schema.labels.failures },
                ].map((group) => (
                  <div key={group.heading}>
                    <p className="text-caption uppercase tracking-[0.08em] text-ink-4">
                      {group.heading}
                    </p>
                    <ul className="mt-2.5 flex flex-wrap gap-2">
                      {group.values.map((value) => (
                        <li key={value}>
                          <Badge tone="outline" className="font-mono">
                            {value}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <div className="border-t border-line bg-canvas">
        <Container size="default" className="py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-display-sm text-ink">
                Ready to try the workflow?
              </h2>
              <p className="mt-2 measure text-body-sm text-ink-3">
                Create an account to pick a role and open its workspace.
              </p>
            </div>
            <ButtonLink href="/signup" size="lg" className="shrink-0">
              Get started
            </ButtonLink>
          </div>
        </Container>
      </div>
    </>
  );
}
