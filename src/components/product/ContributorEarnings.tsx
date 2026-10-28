"use client";

import Link from "next/link";
import { useEarnings } from "@/lib/api/live";
import { QueryView, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { FileText } from "@/components/ui/icons";
import { formatDate, formatMon } from "@/lib/utils/format";

/**
 * Earnings.
 *
 * Reads the real earnings summary: accepted count, settled total, pending total
 * and one row per submitted task. A reward is shown as settled only when a
 * payout receipt exists, and a mocked payout is labelled "Mock settlement"
 * rather than being dressed up as an on-chain transaction. Every settled row
 * links to its public receipt.
 */
export function ContributorEarnings() {
  const earnings = useEarnings();

  return (
    <>
      <WorkspaceHeader
        eyebrow="Contributor"
        title="Earnings"
        description="Rewards are credited on acceptance. Amounts are shown in full precision; an on-chain hash appears only when settlement was recorded on-chain."
      />

      <QueryView
        query={earnings}
        isEmpty={(summary) => summary.tasks.length === 0}
        empty={
          <EmptyState
            icon={FileText}
            title="No earnings yet"
            description="There is nothing to settle until a submission is accepted. Claim and complete a task first."
          />
        }
      >
        {(summary) => {
          const settled = summary.tasks.filter((task) => task.status === "paid");
          const eligible = summary.tasks.filter((task) => task.status === "accepted");

          return (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Settled"
                  value={formatMon(summary.total_paid)}
                  hint={`${settled.length} task${settled.length === 1 ? "" : "s"} paid`}
                />
                <Stat
                  label="Eligible, not settled"
                  value={formatMon(summary.total_pending)}
                  hint={`${eligible.length} accepted task${eligible.length === 1 ? "" : "s"}`}
                  tone="muted"
                />
                <Stat
                  label="Accepted versions"
                  value={String(summary.total_accepted)}
                  hint="Counted toward earnings"
                  tone="muted"
                />
              </div>

              <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-left text-body-sm">
                    <thead>
                      <tr className="border-b border-line text-caption uppercase tracking-[0.05em] text-ink-4">
                        <th scope="col" className="px-5 py-3 font-medium">
                          Job
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Status
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Reward
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Submitted
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Settlement
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.tasks.map((task) => (
                        <tr key={task.task_id} className="border-b border-line last:border-b-0">
                          <td className="px-5 py-3 text-ink">{task.job_title || "—"}</td>
                          <td className="px-5 py-3">
                            <StatusChip status={task.status} />
                          </td>
                          <td className="px-5 py-3 text-ink-3 tnum">
                            {formatMon(task.reward)}
                          </td>
                          <td className="px-5 py-3 text-ink-3">
                            {formatDate(task.submitted_at)}
                          </td>
                          <td className="px-5 py-3 text-ink-3">
                            {!task.receipt_id ? (
                              <span className="text-caption">Not settled</span>
                            ) : (
                              <Link
                                href={`/receipts/${task.receipt_id}`}
                                className="underline decoration-dotted underline-offset-2 hover:text-ink"
                              >
                                {task.settlement_is_mock ? (
                                  "Mock settlement"
                                ) : task.tx_hash ? (
                                  <span className="font-mono text-[11px]">
                                    on-chain · {task.tx_hash.slice(0, 10)}…
                                  </span>
                                ) : (
                                  "Off-chain record"
                                )}
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <InfoNote>
                Settlement in this build follows the configured platform tier. A
                payout is shown as on-chain only when a real transaction hash
                exists; a mocked payout is labelled <strong>Mock settlement</strong>{" "}
                and never presented as a confirmed on-chain payment. Each settled
                row links to its public receipt.
              </InfoNote>
            </>
          );
        }}
      </QueryView>
    </>
  );
}
