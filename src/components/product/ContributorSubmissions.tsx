"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useEarnings } from "@/lib/api/live";
import { QueryView, InfoNote, InlineError } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { FileText } from "@/components/ui/icons";
import { formatDate, formatMon } from "@/lib/utils/format";
import { appealSchema, platformPaths, type EarningsSummary } from "@/lib/api/platform";

type EarningsTask = EarningsSummary["tasks"][number];

/**
 * Submission history.
 *
 * The API exposes a contributor's own submissions through `GET /api/earnings`,
 * which returns one row per task (the latest version) with its status, reward
 * reference and submission id. There is no separate submissions-list endpoint,
 * so this screen reads that real source rather than inventing history.
 *
 * A rejected submission can be appealed from here: the appeal is filed against
 * the exact submission version and a reviewer re-adjudicates it independently.
 */
export function ContributorSubmissions() {
  const earnings = useEarnings();

  return (
    <>
      <WorkspaceHeader
        eyebrow="Contributor"
        title="Submissions"
        description="Every submission is an immutable version. Corrections append a new version rather than editing one already delivered."
      />

      <QueryView query={earnings}>
        {(summary) => {
          const accepted = summary.tasks.filter((task) =>
            ["accepted", "paid"].includes(task.status),
          );
          const pending = summary.tasks.filter((task) =>
            ["submitted", "appealed"].includes(task.status),
          );
          const rejected = summary.tasks.filter((task) => task.status === "rejected");

          return (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Accepted"
                  value={String(summary.total_accepted)}
                  hint="Versions accepted or paid"
                />
                <Stat
                  label="Awaiting outcome"
                  value={String(pending.length)}
                  hint="Submitted or under appeal"
                  tone="muted"
                />
                <Stat
                  label="Pending amount"
                  value={formatMon(summary.total_pending)}
                  hint="Accepted but not yet settled"
                  tone="muted"
                />
              </div>

              {rejected.length > 0 ? (
                <section className="mt-8">
                  <h2 className="font-display text-title text-ink">Rejected work</h2>
                  <p className="mt-1.5 text-body-sm text-ink-3">
                    A rejection is not payable, but it is appealable. File one appeal
                    per submission; a reviewer re-adjudicates the exact version.
                  </p>
                  <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                    {rejected.map((task) => (
                      <li key={task.submission_id}>
                        <RejectedAppeal task={task} onFiled={earnings.reload} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {summary.tasks.length === 0 ? (
                <div className="mt-6">
                  <EmptyState
                    icon={FileText}
                    title="No submissions yet"
                    description="Claim a task from the queue and submit an annotation; it will appear here."
                  />
                </div>
              ) : (
                <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[42rem] border-collapse text-left text-body-sm">
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
                            <td className="px-5 py-3">
                              <Link
                                href={`/workspace/contributor/tasks/${task.task_id}`}
                                className="text-ink hover:text-accent-700"
                              >
                                {task.job_title || task.task_id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-5 py-3">
                              <StatusChip status={task.status} />
                            </td>
                            <td className="px-5 py-3 text-ink-3 tnum">
                              {formatMon(task.reward)}
                            </td>
                            <td className="px-5 py-3 text-ink-3">
                              {formatDate(task.submitted_at)}
                            </td>
                            <td className="px-5 py-3 font-mono text-[11px] text-ink-4">
                              {task.tx_hash ? `${task.tx_hash.slice(0, 10)}…` : "Off-chain record"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {accepted.length === 0 && summary.tasks.length > 0 ? (
                <InfoNote>
                  Nothing has been accepted yet. Only accepted work becomes
                  eligible for settlement.
                </InfoNote>
              ) : null}
            </>
          );
        }}
      </QueryView>

      <InfoNote>
        A submission is a frozen version; the platform delivers the accepted
        version only. Where a task shows an off-chain settlement record, no
        on-chain transaction is implied.
      </InfoNote>
    </>
  );
}

function RejectedAppeal({
  task,
  onFiled,
}: {
  task: EarningsTask;
  onFiled: () => void;
}) {
  const { run, pending, error } = useAction();
  const [reason, setReason] = useState("");
  const [filed, setFiled] = useState(false);

  const file = async () => {
    const result = await run((client) =>
      client.post(appealSchema, platformPaths.appeal(task.submission_id), {
        body: { reason: reason.trim() },
        idempotencyKey: `appeal:${task.submission_id}`,
      }),
    );
    if (result) {
      setFiled(true);
      onFiled();
    }
  };

  return (
    <article className="flex h-full flex-col rounded-xl border border-danger-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[12px] text-ink-4">
          {task.task_id.slice(0, 8)}…
        </span>
        <StatusChip status={task.status} />
      </div>
      <h3 className="mt-3 font-display text-title text-ink">
        {task.job_title || "Task"}
      </h3>
      <p className="mt-2 text-body-sm text-danger-fg">
        This submission was rejected. You may appeal once; a reviewer
        re-adjudicates the exact version.
      </p>
      {filed ? (
        <p className="mt-4 text-caption text-success-fg">
          Appeal filed. It is now awaiting adjudication.
        </p>
      ) : (
        <div className="mt-4">
          <TextAreaField
            id={`appeal-${task.submission_id}`}
            label="Why should this be reconsidered?"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="At least 10 characters."
          />
          <div className="mt-3">
            <Button
              type="button"
              onClick={() => void file()}
              disabled={pending || reason.trim().length < 10}
            >
              {pending ? "Filing…" : "File appeal"}
            </Button>
          </div>
          {error ? (
            <div className="mt-3">
              <InlineError error={error} />
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
