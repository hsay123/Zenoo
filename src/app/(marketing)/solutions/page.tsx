import type { Metadata } from "next";
import { solutionsPage } from "@/lib/content/pages";
import { MetaStrip } from "@/components/marketing/MetaStrip";
import { PageIntro } from "@/components/marketing/PageIntro";
import { MediaPlaceholder } from "@/components/media/MediaPlaceholder";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Check } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "Timestamped action and failure annotation for robotics, medical, industrial and retail data — for buyers, contributors and reviewers.",
};

export default function SolutionsPage() {
  return (
    <>
      <PageIntro
        eyebrow={solutionsPage.eyebrow}
        title={solutionsPage.title}
        lead={solutionsPage.lead}
        actions={
          <>
            <ButtonLink href="/contact" size="lg">
              Start a pilot
            </ButtonLink>
            <ButtonLink href="/platform" variant="secondary" size="lg">
              See the platform
            </ButtonLink>
          </>
        }
        meta={<MetaStrip items={solutionsPage.meta} />}
      />

      {/* Use cases — asymmetric 7/5 then 5/7 */}
      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <SectionHeading
            eyebrow="By use case"
            title="Where timestamped labels change an outcome."
            description="Each case below maps to the labels action-segments-v1 actually supports today. Nothing beyond that schema is implied."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-12 lg:gap-8">
            {solutionsPage.useCases.map((item, index) => (
              <article
                key={item.id}
                id={item.id}
                className={cn(
                  "scroll-mt-28",
                  index % 2 === 0 ? "lg:col-span-7" : "lg:col-span-5",
                )}
              >
                <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface">
                  <MediaPlaceholder
                    asset={item.asset}
                    tone="light"
                    className="rounded-none border-0 border-b"
                    sizes="(min-width: 1024px) 700px, 100vw"
                  />
                  <div className="flex flex-1 flex-col p-6">
                    <h2 className="font-display text-display-sm text-ink">
                      {item.title}
                    </h2>
                    <p className="mt-3 flex-1 text-body-sm text-ink-3">
                      {item.body}
                    </p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {item.labels.map((label) => (
                        <li
                          key={label}
                          className="rounded-full border border-line bg-canvas px-2.5 py-0.5 font-mono text-[11px] text-ink-3"
                        >
                          {label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-8 max-w-3xl text-caption text-ink-4">
            Depth, LiDAR, point clouds and synchronised multi-sensor annotation
            are not supported yet.
          </p>
        </Container>
      </Section>

      {/* By role */}
      <Section tone="surface" spacing="default" divider contained={false}>
        <Container size="default">
          <SectionHeading
            eyebrow="By role"
            title="One workflow, three different jobs."
            description="Buyers, contributors and reviewers each get the surface their work actually needs — and access scoped to exactly that work."
          />

          <div className="mt-12 space-y-4">
            {solutionsPage.roles.map((role, index) => (
              <article
                key={role.id}
                id={role.id}
                className="grid scroll-mt-28 gap-8 rounded-xl border border-line bg-canvas p-6 sm:p-8 lg:grid-cols-12 lg:gap-12"
              >
                <div className="lg:col-span-5">
                  <p className="eyebrow">{role.role}</p>
                  <h3 className="mt-4 text-display-sm text-ink">
                    {role.title}
                  </h3>
                  <p className="mt-4 text-body-sm text-ink-3">{role.body}</p>
                  <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-4">
                    {String(index + 1).padStart(2, "0")} / {String(solutionsPage.roles.length).padStart(2, "0")}
                  </p>
                </div>
                <ul className="lg:col-span-7 lg:border-l lg:border-line lg:pl-12">
                  {role.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-3 border-b border-line py-3.5 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <Check
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                      />
                      <span className="text-body-sm text-ink-2">{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <div className="border-t border-line bg-canvas">
        <Container size="default" className="py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-display-sm text-ink">
                Not sure which schema fits?
              </h2>
              <p className="mt-2 measure text-body-sm text-ink-3">
                Bring the media and the label you need. We will tell you honestly
                whether the current schema covers it.
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <ButtonLink href="/contact" size="lg">
                Talk to us
              </ButtonLink>
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
