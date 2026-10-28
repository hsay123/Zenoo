import { finalCta } from "@/lib/content/landing";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { ArrowRight } from "@/components/ui/icons";

/**
 * Closing call to action — Encord Style.
 *
 * Massive centered CTA with massive vertical whitespace.
 * Pure white background with Lime Green primary CTA.
 */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-white py-24 lg:py-32 xl:py-40">
      <Container size="prose" className="relative">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="text-display-xl text-[#000000] font-bold tracking-[-0.045em] leading-[0.95] max-w-3xl">
            {finalCta.heading}
          </h2>
          <p className="mt-8 max-w-xl text-body-lg text-[#333333] leading-relaxed">
            {finalCta.support}
          </p>

          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <a
              href={finalCta.primary.href}
              className="inline-flex select-none items-center justify-center font-semibold transition-colors duration-150 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 bg-[#CCFF00] text-[#000000] font-semibold hover:bg-[#B8E600] active:bg-[#A3CC00] shadow-[0_1px_2px_rgba(0,0,0,0.08)] rounded-md h-14 px-8 text-body gap-2"
            >
              {finalCta.primary.label}
              <svg className="h-5 w-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4" />
              </svg>
            </a>
            <a
              href={finalCta.secondary.href}
              className="inline-flex select-none items-center justify-center font-semibold transition-colors duration-150 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 bg-white text-[#000000] border border-[#CCCCCC] hover:border-[#999999] hover:bg-[#F5F5F5] font-medium rounded-md h-14 px-8 text-body gap-2"
            >
              {finalCta.secondary.label}
            </a>
          </div>

          <p className="mt-10 text-caption text-[#666666]">
            Pilots run against your rights-cleared data. No account is created
            until a scope is agreed.
          </p>
        </div>
      </Container>
    </section>
  );
}