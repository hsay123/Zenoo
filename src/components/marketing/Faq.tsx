import { faqs } from "@/lib/content/landing";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ChevronDown } from "@/components/ui/icons";

/**
 * FAQ.
 *
 * Uses native `<details>`/`<summary>`: keyboard operable and correctly
 * announced by assistive technology with no JavaScript shipped.
 */
export function Faq() {
  return (
    <Section tone="surface" spacing="default" divider contained={false}>
      <Container size="default">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading
              eyebrow={faqs.eyebrow}
              title={faqs.heading}
              size="md"
            />
          </div>

          <div className="lg:col-span-8">
            <ul className="border-t border-line">
              {faqs.items.map((item) => (
                <li key={item.q} className="border-b border-line">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-ink marker:content-none hover:text-accent-700 [&::-webkit-details-marker]:hidden">
                      <span className="font-display text-title">{item.q}</span>
                      <ChevronDown
                        aria-hidden
                        className="mt-1 h-4 w-4 shrink-0 text-ink-4 transition-transform duration-200 group-open:rotate-180"
                      />
                    </summary>
                    <p className="measure pb-6 pr-10 text-body-sm text-ink-3">
                      {item.a}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </Section>
  );
}
