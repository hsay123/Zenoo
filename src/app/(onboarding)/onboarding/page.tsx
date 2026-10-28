import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/auth/OnboardingFlow";
import { PageIntro } from "@/components/marketing/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Choose a Zeno role and review its setup.",
};

export default function OnboardingPage() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <PageIntro
        eyebrow="Onboarding"
        title="Pick the job you are here to do."
        lead="Buyers commission data, contributors produce it, reviewers decide whether it is good enough. Choose a role to see exactly what setup it involves."
      />
      <Section tone="canvas" spacing="default" contained={false}>
        <Container size="default">
          <OnboardingFlow />
        </Container>
      </Section>
    </main>
  );
}
