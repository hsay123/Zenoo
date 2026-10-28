import { OnboardingGate } from "@/components/auth/OnboardingGate";
import { SessionGate } from "@/lib/api/session";

/**
 * Onboarding route group.
 *
 * Deliberately outside `(product)` so the chooser never renders the workspace
 * shell (whose navigation points at routes the gate would bounce back).
 * `SessionGate` resolves the real profile and `OnboardingGate` keeps
 * `/onboarding` available only to accounts that have not finished onboarding.
 */
export default function OnboardingRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionGate>
      <OnboardingGate>{children}</OnboardingGate>
    </SessionGate>
  );
}
