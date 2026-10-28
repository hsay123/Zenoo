"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/api/session";
import { workspaceRoles } from "@/lib/content/workspace";

/**
 * Workspace entry point.
 *
 * If onboarding is not completed, redirect to /onboarding.
 * Otherwise, each role is taken straight to its own workspace.
 */
export default function WorkspaceHome() {
  const router = useRouter();
  const { user } = useSession();

  useEffect(() => {
    if (!user.onboarding_completed) {
      router.replace("/onboarding");
      return;
    }
    router.replace(workspaceRoles[user.role].home);
  }, [router, user.onboarding_completed, user.role]);

  return (
    <p className="text-body text-ink-2">Opening your workspace…</p>
  );
}
