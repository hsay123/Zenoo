import { credibilityCategories } from "@/lib/content/landing";
import { Container } from "@/components/ui/Container";
import { Info } from "@/components/ui/icons";

/**
 * Credibility Strip — Encord Style.
 *
 * Horizontal greyscale strip mimicking a customer logo carousel.
 * Large, thin-to-medium weight black font for feature headings.
 * Center-aligned with generous vertical padding (4rem top/bottom).
 */
export function CredibilityStrip() {
  return (
    <section
      aria-label="Workflow coverage"
      className="border-y border-[#E0E0E0] bg-white py-16 lg:py-24"
    >
      <Container size="wide" className="px-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          {/* Left label */}
          <div className="mb-10 lg:mb-0 lg:w-48 lg:shrink-0">
            <span className="text-eyebrow uppercase text-[#666666]">
              Workflow coverage
            </span>
          </div>

          {/* Horizontal logo strip / feature carousel */}
          <div className="overflow-x-auto lg:overflow-visible">
            <ul className="flex flex-row gap-10 lg:gap-16 lg:justify-center lg:items-center lg:flex-nowrap lg:overflow-visible">
              {credibilityCategories.map((category) => (
                <li
                  key={category.label}
                  className="flex flex-col items-center gap-3 min-w-[140px] lg:min-w-[160px] lg:flex-1 shrink-0"
                >
                  <p className="font-display text-[1.125rem] lg:text-[1.25rem] font-medium tracking-[-0.01em] text-[#000000] text-center leading-tight">
                    {category.label}
                  </p>
                  <p className="text-caption text-[#666666] text-center max-w-xs">
                    {category.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Info note */}
          <p className="mt-12 flex items-center justify-center gap-2 text-caption text-[#666666] lg:mt-16">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="max-w-2xl text-center">
              Verified partner and customer logos will appear here once
              relationships are confirmed. Until then this strip states the
              workflow areas the platform covers.
            </span>
          </p>
        </div>
      </Container>
    </section>
  );
}