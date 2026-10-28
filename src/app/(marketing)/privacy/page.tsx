import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Prose } from "@/components/marketing/Prose";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { AlertTriangle } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Zeno handles source media, annotation records and account data — what stays off-chain and what we do not claim.",
};

const updated = "12 October 2026";

export default function PrivacyPage() {
  return (
    <>
      <PageIntro
        eyebrow="Legal"
        title="Privacy"
        lead="How we handle source media, annotation records and account data. Raw video, personal information, private annotations and reviewer notes stay off-chain."
      />

      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <div className="mb-10 flex items-start gap-3 rounded-lg border border-pending-line bg-pending-bg p-4">
            <AlertTriangle
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-pending-fg"
            />
            <p className="measure text-body-sm text-pending-fg">
              Zeno is at the pilot stage and this document has not yet
              been reviewed by counsel. It describes intended handling
              accurately for the current build; it is not legal advice and it
              will change before any commercial launch.
            </p>
          </div>

          <Prose>
            <p>
              <strong>Last updated:</strong> {updated}
            </p>

            <h2>1. What we process</h2>
            <p>
              To run an annotation workflow we process a limited set of data,
              grouped here so the boundary is clear:
            </p>
            <ul>
              <li>
                <strong>Source media</strong> — rights-cleared images or video
                supplied by a buyer, stored in private object storage and
                streamed only for the assigned segment.
              </li>
              <li>
                <strong>Annotation records</strong> — structured labels,
                timestamps, schema version and review decisions attached to a
                task.
              </li>
              <li>
                <strong>Account data</strong> — email, role, organization
                membership and the profile fields required to operate an
                account.
              </li>
              <li>
                <strong>Operational records</strong> — audit events,
                assignment leases, export manifests and payout state.
              </li>
            </ul>

            <h2>2. What stays off-chain</h2>
            <p>
              Videos, personal information, private annotations, reviewer
              notes, customer datasets and application state are never placed
              on a blockchain. Only selected funding, settlement and provenance
              events may be recorded, and only where a project enables them.
            </p>
            <p>
              A content hash helps detect that a record changed. It does not
              prove that an annotation is correct, and we do not claim that it
              does. A wallet address is not a substitute for identity
              verification.
            </p>

            <h2>3. How we use it</h2>
            <ul>
              <li>To distribute tasks and authorize access to the correct segment.</li>
              <li>To validate, review and deliver annotation work.</li>
              <li>To operate appeals, audits and quality measurement.</li>
              <li>To reconcile settlement records where a payment is made.</li>
            </ul>

            <h2>4. Access and least privilege</h2>
            <p>
              Access is scoped to an organization, project, task and role. A
              contributor sees only assigned clips and their own work; a
              reviewer sees their assigned queue and cannot approve their own
              submissions. Media requests are authorized server-side, and
              permanent public URLs are never issued.
            </p>

            <h2>5. Retention and deletion</h2>
            <p>
              Retention is defined separately for source video, drafts,
              accepted records, audit logs, payment records and account data.
              Lawful deletion is supported, except where financial or audit
              records must be preserved. Where deletion must remain possible,
              we keep that data off-chain.
            </p>

            <h2>6. Cookies and analytics</h2>
            <p>
              This marketing site sets no advertising cookies and runs no
              third-party tracking. The product application uses a server-side
              session cookie for authentication only.
            </p>

            <h2>7. Your choices</h2>
            <p>
              You can ask for a copy of the account data we hold, request
              correction, or request deletion, subject to the retention
              obligations above. Use the <a href="/contact">contact form</a> and
              we will respond in business hours.
            </p>

            <h2>8. Changes</h2>
            <p>
              As the pilot progresses this document will be revised and, before
              commercial launch, reviewed by counsel. Material changes will be
              dated here.
            </p>
          </Prose>
        </Container>
      </Section>
    </>
  );
}
