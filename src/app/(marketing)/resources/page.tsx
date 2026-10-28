import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileText, Info } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Documentation, schema reference and the changelog for the Zeno pilot.",
};

const changelog = [
  {
    date: "12 Oct 2026",
    version: "v0.1",
    title: "Pilot interface",
    body: "Marketing site, role-based workspaces for buyers, contributors and reviewers, and the action-segments-v1 schema reference. All product screens run on labelled sample data.",
  },
  {
    date: "12 Oct 2026",
    version: "v0.0",
    title: "Design system and shell",
    body: "Shared tokens, navigation, footer and UI primitives that the site and application both build on.",
  },
] as const;

export default function ResourcesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Resources"
        title="Documentation and changelog."
        lead="Reference material for the pilot. Where something is not written yet, it says so rather than linking to a page that does not exist."
      />

      {/* Docs — #docs */}
      <Section id="docs" tone="canvas" spacing="default" className="scroll-mt-28" contained={false}>
        <Container size="default">
          <SectionHeading
            eyebrow="Documentation"
            title="Setup and schema reference."
            description="Written reference is in progress. The one fully specified artifact today is the export schema."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <article className="flex flex-col justify-between gap-6 rounded-xl border border-line bg-surface p-6">
              <div>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-canvas text-accent-600"
                  >
                    <FileText className="h-4 w-4" />
                  </span>
                  <h3 className="font-display text-title text-ink">
                    Export schema reference
                  </h3>
                </div>
                <p className="mt-3 text-body-sm text-ink-3">
                  The action-segments-v1 record shape, field meanings and the
                  files shipped in an export package.
                </p>
              </div>
              <ButtonLink href="/explore#schema" variant="secondary" size="md">
                View the schema
              </ButtonLink>
            </article>

            <article className="flex flex-col justify-between gap-6 rounded-xl border border-line bg-surface p-6">
              <div>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-canvas text-accent-600"
                  >
                    <Info className="h-4 w-4" />
                  </span>
                  <h3 className="flex items-center gap-2 font-display text-title text-ink">
                    API and integration guide
                    <Badge tone="neutral">Planned</Badge>
                  </h3>
                </div>
                <p className="mt-3 text-body-sm text-ink-3">
                  The HTTP surface the application is written against is defined
                  in code, but a public integration guide is not published yet.
                </p>
              </div>
              <ButtonLink href="/contact" variant="secondary" size="md">
                Ask about integrations
              </ButtonLink>
            </article>
          </div>
        </Container>
      </Section>

      {/* Changelog — #changelog */}
      <Section id="changelog" tone="surface" spacing="default" divider className="scroll-mt-28" contained={false}>
        <Container size="default">
          <SectionHeading
            eyebrow="Changelog"
            title="What has actually shipped."
            description="Entries describe shipped interface work in this build. No product capability is listed here before it exists."
          />

          <ol className="mt-12 border-t border-line">
            {changelog.map((entry) => (
              <li
                key={entry.version}
                className="grid gap-3 border-b border-line py-6 sm:grid-cols-[10rem_1fr] sm:gap-8"
              >
                <div>
                  <span className="font-mono text-[12px] text-accent-700">
                    {entry.version}
                  </span>
                  <span className="mt-1 block text-caption text-ink-4">
                    {entry.date}
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-title text-ink">
                    {entry.title}
                  </h3>
                  <p className="mt-2 measure text-body-sm text-ink-3">
                    {entry.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <EmptyState
            className="mt-8"
            icon={Info}
            title="Nothing further has been released"
            description="Future entries will appear here as features land, with dates, rather than as a roadmap of promises."
          />
        </Container>
      </Section>
    </>
  );
}
