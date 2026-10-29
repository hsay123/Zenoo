"use client";

import { useState } from "react";
import { useAction, useClientQuery } from "@/lib/api/live";
import { InlineError, InfoNote, QueryView } from "@/components/product/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  integrityFlagListSchema,
  integrityFlagUpdateSchema,
  integrityRunSchema,
  platformPaths,
  type IntegrityFlag,
} from "@/lib/api/platform";
import { formatDate } from "@/lib/utils/format";

const SIGNAL_LABEL: Record<IntegrityFlag["signal"], string> = {
  wallet_link: "Shared wallet",
  duplicate_work: "Identical labels",
  self_dealing: "Labelled a linked account's job",
  linked_review: "Reviewed a linked account",
};

const who = (account: IntegrityFlag["user"]) =>
  account ? account.email ?? `${account.id.slice(0, 8)}…` : "—";

function FlagRow({ flag, onChanged }: { flag: IntegrityFlag; onChanged: () => void }) {
  const { run, pending, error } = useAction();
  const resolve = (status: "confirmed" | "cleared") =>
    void run(async (client) => {
      const updated = await client.patch(integrityFlagUpdateSchema, platformPaths.integrityFlag(flag.id), {
        body: { status },
      });
      onChanged();
      return updated;
    });

  return (
    <tr className="border-b border-line align-top last:border-b-0">
      <td className="px-5 py-3">
        <p className="text-ink">{SIGNAL_LABEL[flag.signal]}</p>
        <p className="text-caption text-ink-4">
          {flag.source === "tigergraph" ? "TigerGraph" : "Local graph"} · {formatDate(flag.updated_at)}
        </p>
      </td>
      <td className="px-5 py-3 text-ink">{who(flag.user)}</td>
      <td className="px-5 py-3 text-ink-3">{flag.related ? who(flag.related) : "own job"}</td>
      <td className="px-5 py-3">
        <code className="block max-w-[18rem] truncate font-mono text-[11px] text-ink-4">
          {JSON.stringify(flag.evidence)}
        </code>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => resolve("confirmed")}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve("cleared")}>
            Clear
          </Button>
        </div>
        {error ? (
          <div className="mt-1.5">
            <InlineError error={error} />
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Integrity (HHG F6.2): duplicate-account and self-dealing flags from the
 * account graph (TigerGraph when configured, else the local graph engine).
 * Flags send an account's work to human review and keep linked reviewers
 * off it; they never block payouts. An admin confirms or clears each one.
 */
export function IntegrityFlags() {
  const flags = useClientQuery("integrity-flags:open", (client) =>
    client.get(integrityFlagListSchema, platformPaths.integrityFlags("open")),
  );
  const { run, pending, error } = useAction();
  const [summary, setSummary] = useState<string | null>(null);

  const runCheck = () =>
    void run(async (client) => {
      const result = await client.post(integrityRunSchema, platformPaths.integrityRun());
      setSummary(
        `${result.engine === "tigergraph" ? "TigerGraph" : "Local graph"} checked ` +
          `${result.accounts} accounts and ${result.submissions} submissions: ` +
          `${result.flags} flag${result.flags === 1 ? "" : "s"}.`,
      );
      flags.reload();
      return result;
    });

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-title text-ink">Integrity flags</h2>
        <div className="flex items-center gap-2">
          {flags.status === "ready" ? (
            <Badge tone="outline">{flags.data.engine === "tigergraph" ? "TigerGraph" : "Local graph"}</Badge>
          ) : null}
          <Button size="sm" variant="secondary" disabled={pending} onClick={runCheck}>
            {pending ? "Checking…" : "Run check"}
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-body-sm text-ink-3">
        Accounts linked by a shared wallet or identical labels, contributors paid on a linked
        account&apos;s job, and reviewers deciding a linked account&apos;s work. A flag sends that
        account&apos;s submissions to human review and keeps linked reviewers off them; it never
        blocks a payout.
      </p>
      {summary ? <p className="mt-3 text-caption text-ink-3" role="status">{summary}</p> : null}
      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}

      <div className="mt-4">
        <QueryView
          query={flags}
          isEmpty={(data) => data.items.length === 0}
          empty={<InfoNote>No open flags.</InfoNote>}
        >
          {(data) => (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] border-collapse text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-line text-caption uppercase tracking-[0.05em] text-ink-4">
                      <th scope="col" className="px-5 py-3 font-medium">Signal</th>
                      <th scope="col" className="px-5 py-3 font-medium">Account</th>
                      <th scope="col" className="px-5 py-3 font-medium">Linked to</th>
                      <th scope="col" className="px-5 py-3 font-medium">Evidence</th>
                      <th scope="col" className="px-5 py-3 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((flag) => (
                      <FlagRow key={flag.id} flag={flag} onChanged={flags.reload} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </QueryView>
      </div>
    </section>
  );
}
