import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { Check } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Zeno workspace.",
};

const points = [
  "Buyer, contributor and reviewer surfaces, each scoped to its job",
  "Quality signals and spend reconciliation at a glance",
  "Versioned submissions and a full review history",
];

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back."
      subtitle="Sign in to reach your workspace. Use an email one-time code or a wallet — the session is verified by the platform API."
      aside={
        <ul className="space-y-3">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2.5">
              <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
              <span className="text-body-sm text-ink-2">{point}</span>
            </li>
          ))}
        </ul>
      }
      footer={
        <p className="text-body-sm text-ink-3">
          No account yet?{" "}
          <Link href="/signup" className="font-medium text-accent-700 hover:underline">
            Create one
          </Link>
        </p>
      }
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
