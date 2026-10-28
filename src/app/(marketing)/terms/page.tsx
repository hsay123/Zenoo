import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Prose } from "@/components/marketing/Prose";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { AlertTriangle } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms that govern use of the Zeno platform during its pilot stage.",
};

const updated = "12 October 2026";

export default function TermsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Legal"
        title="Terms of use"
        lead="The terms that govern access to the Zeno pilot: roles, data-rights declarations, acceptance-linked payment and acceptable use."
      />

      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <div className="mb-10 flex items-start gap-3 rounded-lg border border-pending-line bg-pending-bg p-4">
            <AlertTriangle
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-pending-fg"
            />
            <p className="measure text-body-sm text-pending-fg">
              These terms are a pilot-stage working draft and have not yet been
              reviewed by counsel. They describe intended behaviour of the current
              build; the binding agreement for any pilot is the signed scope.
            </p>
          </div>

          <Prose>
            <p>
              <strong>Last updated:</strong> {updated}
            </p>

            <h2>1. The service</h2>
            <p>
              Zeno provides managed, quality-assured annotation of
              rights-cleared images or video. Buyers commission and fund work;
              contributors complete scoped tasks; reviewers evaluate submissions
              against an agreed rubric; accepted work is packaged into a
              versioned dataset.
            </p>

            <h2>2. Accounts and roles</h2>
            <p>
              Access is role-based: company admin or member, contributor,
              reviewer and adjudicator. You are responsible for activity under
              your account. A connected wallet is not identity verification and
              does not by itself establish eligibility for any role.
            </p>

            <h2>3. Data rights</h2>
            <p>
              A buyer must confirm lawful authority to process each dataset and
              to share it with authorized contributors and reviewers. You must
              not upload data you do not have the right to use. Buyers are
              responsible for the rights metadata attached to a dataset.
            </p>

            <h2>4. Contributor work and payment</h2>
            <ul>
              <li>
                Reward, estimated effort, deadline and the acceptance rubric are
                shown before a task is claimed.
              </li>
              <li>
                Only work accepted under the published policy becomes eligible
                for payment. <strong>Submitted, accepted and paid are distinct
                states.</strong>
              </li>
              <li>
                Rejected work is not payable, but is appealable. Your work is
                never silently forfeited.
              </li>
              <li>
                Payouts are idempotent. A failed transaction stays visibly
                unpaid and is reconciled; it is not retried into a duplicate.
              </li>
            </ul>

            <h2>5. Review and appeals</h2>
            <p>
              Reviewers cannot review or approve their own submissions. Decisions
              carry a reason code and are recorded. You may appeal a decision;
              an independent adjudicator re-reviews with the evidence and records
              an outcome.
            </p>

            <h2>6. Acceptable use</h2>
            <ul>
              <li>Do not attempt to access data outside your scope.</li>
              <li>Do not copy, redistribute or reuse buyer media or datasets.</li>
              <li>Do not create duplicate accounts or manipulate the task queue.</li>
              <li>Do not bypass review, settlement or access controls.</li>
            </ul>

            <h2>7. Deliverables</h2>
            <p>
              An export is generated from a frozen set of accepted versions and
              delivered through authenticated, expiring access. Regeneration
              produces a new version; a prior deliverable is never silently
              replaced. A content hash supports integrity checking and does not,
              on its own, establish correctness.
            </p>

            <h2>8. Availability and disclaimers</h2>
            <p>
              The pilot is provided as-is while in development. We do not warrant
              uninterrupted availability, and we make no claim that blockchain
              records establish annotation correctness, legal rights or identity.
            </p>

            <h2>9. Changes</h2>
            <p>
              These terms will be revised as the pilot progresses and reviewed by
              counsel before commercial launch. Material changes will be dated
              here.
            </p>
          </Prose>
        </Container>
      </Section>
    </>
  );
}
