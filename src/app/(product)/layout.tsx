import { SessionGate } from "@/lib/api/session";
import { OnboardingGate } from "@/components/auth/OnboardingGate";
import { ProductShell } from "@/components/product/ProductShell";

/**
 * Authenticated product layout.
 *
 * Route group `(product)` keeps clean URLs (`/workspace/...`) while
 * giving the application its own dense shell — separate from the
 * marketing chrome in `(marketing)`.
 *
 * `SessionGate` resolves the signed-in profile from `GET /api/me` before
 * anything renders, and `OnboardingGate` then makes onboarding status a
 * required gate for every workspace URL. A profile that has not finished
 * onboarding is sent to `/onboarding` no matter which workspace URL it opened.
 */
export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionGate>
      <OnboardingGate>
        <ProductShell>{children}</ProductShell>
      </OnboardingGate>
    </SessionGate>
  );
}
