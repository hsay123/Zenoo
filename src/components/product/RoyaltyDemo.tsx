"use client";

import { useState } from "react";
import { useAction } from "@/lib/api/live";
import { InlineError, InfoNote } from "@/components/product/AsyncView";
import { Stat } from "@/components/product/WorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { platformPaths, royaltyDemoSchema, type RoyaltyDemo as Result } from "@/lib/api/platform";
import { appChain } from "@/lib/privy/config";
import { formatUsdc } from "@/lib/utils/format";

const controlClasses =
  "rounded-md border border-line-strong bg-surface px-3 py-1.5 text-body-sm text-ink transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:cursor-not-allowed disabled:bg-surface-muted";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * ROADMAP DEMO (HHG F5): simulate one data-API sale of a job's labelled data
 * and split it 50% Zeno / 30% data owner / 20% contributors on-chain.
 * Preview always works; a live run pays test USDC from the platform treasury.
 */
export function RoyaltyDemo() {
  const { run, pending, error } = useAction();
  const [jobId, setJobId] = useState("");
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<Result | null>(null);

  const submit = (dryRun: boolean) =>
    void run(async (client) => {
      const response = await client.post(royaltyDemoSchema, platformPaths.royaltyDemo(), {
        body: { job_id: jobId.trim(), amount: amount.trim(), dry_run: dryRun },
      });
      setResult(response);
      return response;
    });

  const explorer = appChain.blockExplorers.default.url;

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-title text-ink">Royalty split</h2>
        <Badge tone="outline">Roadmap demo</Badge>
      </div>
      <p className="mt-1.5 text-body-sm text-ink-3">
        Simulates one data-API purchase of a job&apos;s accepted labels and splits the
        payment 50% Zeno, 30% data owner, 20% contributors (weighted by accepted
        labels). There is no live data API yet; a run pays test USDC from the
        platform treasury on {appChain.name}.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(true);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="royalty-job" className="text-body-sm font-medium text-ink">
            Job id
          </label>
          <input
            id="royalty-job"
            className={`${controlClasses} w-80 font-mono`}
            value={jobId}
            placeholder="00000000-0000-0000-0000-000000000000"
            onChange={(event) => setJobId(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="royalty-amount" className="text-body-sm font-medium text-ink">
            Sale amount (test USDC)
          </label>
          <input
            id="royalty-amount"
            type="number"
            inputMode="decimal"
            step="0.000001"
            min="0"
            className={`${controlClasses} w-36`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending || !jobId.trim()}>
          Preview split
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || !jobId.trim() || !result?.live_available}
          onClick={() => submit(false)}
        >
          {pending ? "Working…" : "Run on testnet"}
        </Button>
      </form>

      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}

      {result ? (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Stat label="Zeno (50%)" value={formatUsdc(result.plan.shares.zeno)} hint="Includes rounding dust" />
            <Stat
              label="Data owner (30%)"
              value={formatUsdc(result.plan.shares.data_owner)}
              hint={short(result.plan.data_owner)}
              tone="muted"
            />
            <Stat
              label="Contributors (20%)"
              value={formatUsdc(result.plan.shares.contributors)}
              hint={`${result.plan.contributors.length} wallet${result.plan.contributors.length === 1 ? "" : "s"}`}
              tone="muted"
            />
          </div>

          <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-body-sm">
            {result.plan.contributors.map((c) => (
              <li key={c.wallet} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="font-mono text-[12px] text-ink-3">{short(c.wallet)}</span>
                <span className="text-ink-3">
                  {c.accepted_labels} accepted label{c.accepted_labels === 1 ? "" : "s"}
                </span>
                <span className="text-ink tnum">{formatUsdc(c.share)}</span>
              </li>
            ))}
          </ul>

          {result.mode === "live" && result.tx_hash ? (
            <InfoNote>
              Split paid on {appChain.name}:{" "}
              <a
                href={`${explorer}/tx/${result.tx_hash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] underline hover:text-ink-2"
              >
                {result.tx_hash.slice(0, 10)}…{result.tx_hash.slice(-8)}
              </a>
            </InfoNote>
          ) : null}
          {!result.live_available && result.live_unavailable_reason ? (
            <InfoNote>Preview only: {result.live_unavailable_reason}.</InfoNote>
          ) : null}
          {result.plan.skipped_without_wallet > 0 ? (
            <InfoNote>
              {result.plan.skipped_without_wallet} contributor
              {result.plan.skipped_without_wallet === 1 ? " has" : "s have"} no payout
              wallet and {result.plan.skipped_without_wallet === 1 ? "is" : "are"} left out
              of this split.
            </InfoNote>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
