import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { Check } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Get started",
  description: "Create a Zeno account and pick a role.",
};

const points = [
  "Rights-cleared video only — you control what enters the platform",
  "Publish a schema and rubric once, then run scoped jobs",
  "Contributors see criteria and reward before they claim",
];

export default function SignupPage() {
  return (
    <AuthShell
      title="Start with one job."
      subtitle="Create an account and choose a role. Sign-in uses an email one-time code or a wallet, and a wallet is created for you if you don't have one."
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
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent-700 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
