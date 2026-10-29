"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Check } from "@/components/ui/icons";
import { appChain } from "@/lib/privy/config";

/**
 * Authentication form (login or signup).
 *
 * Sign-in is handled entirely by Privy: the button opens the Privy modal with
 * email (one-time code) and wallet methods, and an embedded wallet is created
 * for users who do not have one. On success we go straight to the workspace,
 * which resolves the real profile and handles onboarding redirect.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  const isSignup = mode === "signup";

  useEffect(() => {
    if (ready && authenticated) router.replace("/workspace");
  }, [ready, authenticated, router]);

  return (
    <div className="flex flex-col gap-5">
      <Button
        size="lg"
        disabled={!ready || authenticated}
        onClick={() => login()}
      >
        {authenticated
          ? "Signed in — opening workspace…"
          : isSignup
            ? "Create account"
            : "Sign in"}
      </Button>

      <p className="text-body-sm text-ink-2">
        Continue with an email one-time code or a wallet. No password is stored,
        and a wallet is created for you if you don&apos;t already have one.
      </p>

      <div className="flex items-center gap-2 border-t border-line pt-5 text-caption text-ink-4">
        <Check aria-hidden className="h-3.5 w-3.5 text-accent-600" />
        Secured by Privy · {appChain.name}
      </div>
    </div>
  );
}
