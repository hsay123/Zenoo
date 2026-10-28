"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionFrame, useSession } from "@/lib/api/session";
import { onboardingGateDecision } from "@/lib/api/onboarding";

/**
 * Required onboarding gate for the authenticated area.
 *
 * Placed inside `SessionGate` (so the real profile is already resolved) and
 * around the route's chrome + content, so:
 *   - an account that has not finished onboarding cannot render any workspace
 *     screen, however it reached the URL — `/workspace/contributor`, a nested
 *     job/review URL, or a deep link;
 *   - `/onboarding` stays reachable for those accounts;
 *   - an account that already finished is never shown the chooser again.
 *
 * While a redirect is pending it renders a neutral placeholder, never the
 * destination's content, so there is no workspace-content flash and no
 * chooser/workspace loop.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();

  const decision = onboardingGateDecision({
    pathname,
    onboardingCompleted: user.onboarding_completed,
    role: user.role,
  });
  const redirect = decision.allow ? null : decision.redirect;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (redirect) {
    return (
      <SessionFrame>
        <p className="text-body text-ink-2">Taking you to the right place…</p>
      </SessionFrame>
    );
  }

  return <>{children}</>;
}
