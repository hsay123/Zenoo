import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/ContactForm";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Info } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Start a pilot or ask a question about quality-assured image and video data annotation.",
};

export default function ContactPage() {
  return (
    <>
      <PageIntro
        eyebrow="Contact"
        title="Start with the data you already have."
        lead="Tell us what you are labelling, what a mistake costs you, and what format your pipeline needs. If the current schema does not fit, we will say so."
      />

      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <ContactForm />
            </div>

            <aside className="lg:col-span-5">
              <div className="rounded-xl border border-line bg-surface p-6">
                <h2 className="font-display text-title text-ink">
                  What happens next
                </h2>
                <ol className="mt-4 space-y-4">
                  {[
                    {
                      step: "01",
                      title: "A short conversation",
                      body: "We map your labels and timestamps to what the schema can express today.",
                    },
                    {
                      step: "02",
                      title: "A scoped pilot",
                      body: "One rights-cleared dataset and a narrow label set, run as a controlled batch.",
                    },
                    {
                      step: "03",
                      title: "Measured results",
                      body: "Cost per accepted record and turnaround, before any broad commitment.",
                    },
                  ].map((item) => (
                    <li key={item.step} className="flex gap-4">
                      <span className="font-mono text-[12px] text-accent-700 tnum">
                        {item.step}
                      </span>
                      <span>
                        <span className="block font-display text-[0.9375rem] font-medium text-ink">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-body-sm text-ink-3">
                          {item.body}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-line bg-surface-muted p-4">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
                <p className="text-caption text-ink-3">
                  This build has no mailbox connected, so the form validates
                  your message and then tells you plainly that it was not sent.
                  That is deliberate: it will never imply a delivery that did
                  not happen.
                </p>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
