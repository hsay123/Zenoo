"use client";

import { InfoNote } from "@/components/product/AsyncView";
import { Stat } from "@/components/product/WorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import type { EarningsSummary } from "@/lib/api/platform";

type Reputation = NonNullable<EarningsSummary["reputation"]>;
type Tier = Reputation["tier"];

const TIER_LABEL: Record<Tier, string> = {
  new: "New",
  verified: "Verified",
  trusted: "Trusted",
  reviewer: "Reviewer",
};

const TIER_TONE: Record<Tier, "outline" | "neutral" | "accent" | "dark"> = {
  new: "outline",
  verified: "neutral",
  trusted: "accent",
  reviewer: "dark",
};

const TIER_ACCESS: Record<Tier, string> = {
  new: "Qualification (gold) tasks only. Pass them to unlock paid image tasks.",
  verified: "Paid image tasks. Video tasks unlock at Trusted.",
  trusted: "All task types, including video.",
  reviewer: "All task types. Eligible for promotion to reviewer by an admin.",
};

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

/**
 * Contributor reputation (HHG F4): tier, score and what the next tier needs.
 * Score = 60% gold accuracy + 40% acceptance rate; tiers gate which tasks a
 * contributor can claim (enforced by the backend).
 */
export function ContributorReputation({ reputation }: { reputation: Reputation }) {
  const { stats } = reputation;
  const goldAttempts = stats.goldPassed + stats.goldFailed;
  const decided = stats.accepted + stats.rejected + stats.revised;

  return (
    <section className="mb-6 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-title text-ink">Reputation</h2>
        <Badge tone={TIER_TONE[reputation.tier]}>Tier: {TIER_LABEL[reputation.tier]}</Badge>
      </div>
      <p className="mt-1.5 text-body-sm text-ink-3">{TIER_ACCESS[reputation.tier]}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Score"
          value={reputation.score === null ? "—" : String(reputation.score)}
          hint="60% gold accuracy, 40% acceptance"
        />
        <Stat
          label="Gold accuracy"
          value={pct(reputation.gold_accuracy)}
          hint={`${stats.goldPassed} of ${goldAttempts} gold task${goldAttempts === 1 ? "" : "s"} passed`}
          tone="muted"
        />
        <Stat
          label="Acceptance rate"
          value={pct(reputation.acceptance_rate)}
          hint={`${stats.accepted} of ${decided} reviewed task${decided === 1 ? "" : "s"} accepted`}
          tone="muted"
        />
      </div>

      {reputation.next && reputation.next.needs.length > 0 ? (
        <InfoNote>
          To reach <strong>{TIER_LABEL[reputation.next.tier]}</strong>:{" "}
          {reputation.next.needs.join("; ")}.
        </InfoNote>
      ) : null}
      {reputation.tier_floor && reputation.earned_tier !== reputation.tier ? (
        <InfoNote>
          Your access is held at {TIER_LABEL[reputation.tier]} for your account; your
          score from completed work is shown above.
        </InfoNote>
      ) : null}
    </section>
  );
}
