"use client";

import Link from "next/link";
import { useAction, useJob, useJobTasks } from "@/lib/api/live";
import { QueryView, InlineError, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";
import { Progress } from "@/components/product/Progress";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { FileText, Download } from "@/components/ui/icons";
import { formatCount, formatDate, formatMon } from "@/lib/utils/format";
import { jobSchema, platformPaths, type Job, type Task } from "@/lib/api/platform";

const countBy = (tasks: Task[], statuses: Task["status"][]) =>
  tasks.filter((task) => statuses.includes(task.status)).length;

function JobLifecycle({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const { run, pending, error } = useAction();

  const transition = async (action: "publish" | "pause" | "resume" | "close") => {
    const path =
      action === "publish"
        ? platformPaths.publishJob(job.id)
        : action === "pause"
          ? platformPaths.pauseJob(job.id)
          : action === "resume"
            ? platformPaths.resumeJob(job.id)
            : platformPaths.closeJob(job.id);
    const result = await run((client) => client.post(jobSchema, path));
    if (result) onChanged();
  };

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-title text-ink">Lifecycle</h2>
      <p className="mt-1.5 text-body-sm text-ink-3">
        Publishing makes this job&apos;s tasks claimable. Pausing blocks new
        claims without discarding work already in progress; closing is final.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {job.status === "draft" ? (
          <Button onClick={() => void transition("publish")} disabled={pending}>
            Publish job
          </Button>
        ) : null}
        {job.status === "published" ? (
          <Button
            variant="secondary"
            onClick={() => void transition("pause")}
            disabled={pending}
          >
            Pause job
          </Button>
        ) : null}
        {job.status === "paused" ? (
          <Button onClick={() => void transition("resume")} disabled={pending}>
            Resume job
          </Button>
        ) : null}
        {job.status === "published" || job.status === "paused" ? (
          <Button
            variant="danger"
            onClick={() => void transition("close")}
            disabled={pending}
          >
            Close job
          </Button>
        ) : null}
        {job.status === "closed" ? (
          <span className="text-caption text-ink-4">
            This job is closed and no longer accepts tasks.
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}
    </section>
  );
}

export function BuyerJobDetail({ jobId }: { jobId: string }) {
  const jobQuery = useJob(jobId);
  const tasksQuery = useJobTasks(jobId);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-5 text-caption text-ink-4">
        <Link href="/workspace/buyer" className="hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="font-mono">{jobId}</span>
      </nav>

      <QueryView query={jobQuery}>
        {(job) => (
          <>
            <WorkspaceHeader
              eyebrow="Buyer · job"
              title={job.title}
              description={
                <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <StatusChip status={job.status} />
                  <span className="capitalize text-ink-3">{job.modality}</span>
                  <span className="text-ink-3">
                    Reward / task {formatMon(job.reward_per_task)}
                  </span>
                  <span className="text-ink-3">
                    {job.deadline
                      ? `Deadline ${formatDate(job.deadline)}`
                      : "No deadline"}
                  </span>
                </span>
              }
              actions={
                <ButtonLink
                  href={`/workspace/buyer/jobs/${job.id}/export`}
                  variant="secondary"
                >
                  <FileText className="h-4 w-4" />
                  Export
                </ButtonLink>
              }
            />

            <section className="rounded-xl border border-line bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-title text-ink">Job budget</h2>
                <Badge tone="neutral">Budget: {formatMon(job.budget)}</Badge>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    Budget
                  </dt>
                  <dd className="mt-1 font-display text-[1.25rem] text-ink tnum">
                    {formatMon(job.budget)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    Reward / task
                  </dt>
                  <dd className="mt-1 font-display text-[1.25rem] text-ink tnum">
                    {formatMon(job.reward_per_task)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    Escrow
                  </dt>
                  <dd className="mt-1 text-body-sm text-ink-2">
                    {job.chain_job_id ? (
                      <>
                        Funded on Monad testnet —{" "}
                        <span className="font-mono text-[12px]">{job.chain_job_id}</span>
                      </>
                    ) : (
                      "No on-chain funding reference recorded for this job yet."
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    Labels
                  </dt>
                  <dd className="mt-1 text-body-sm text-ink-2">
                    {job.label_list.join(", ")}
                  </dd>
                </div>
              </dl>
              <InfoNote>
                Escrow funding is recorded on-chain as a job reference; when none
                is recorded, the job is shown as unfunded rather than implied to
                be funded. Settlement runs from real review decisions. This API
                build does not expose a per-job settled amount, so none is shown
                here rather than fabricated, and every payment is labelled mock
                or real wherever a receipt displays it.
              </InfoNote>
            </section>

            <section className="mt-6">
              <h2 className="font-display text-title text-ink">Task states</h2>
              <QueryView
                query={tasksQuery}
                isEmpty={(tasks) => tasks.length === 0}
                empty={
                  <div className="mt-4">
                    <InfoNote>
                      This job has no tasks yet. Tasks are generated from a
                      job&apos;s media when the job is created.
                    </InfoNote>
                  </div>
                }
              >
                {(tasks) => {
                  const accepted = countBy(tasks, ["accepted", "paid"]);
                  return (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        {(
                          [
                            ["Available", countBy(tasks, ["available"])],
                            ["In progress", countBy(tasks, ["claimed", "draft"])],
                            ["In review", countBy(tasks, ["submitted"])],
                            ["Needs revision", countBy(tasks, ["needs_revision"])],
                            ["Accepted", accepted],
                            ["Rejected", countBy(tasks, ["rejected", "appealed"])],
                          ] as const
                        ).map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-lg border border-line bg-surface p-3.5"
                          >
                            <p className="text-caption text-ink-4">{label}</p>
                            <p className="mt-1 font-display text-[1.375rem] font-medium text-ink tnum">
                              {formatCount(value)}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5">
                        <div className="flex justify-between text-caption text-ink-4">
                          <span>Accepted</span>
                          <span className="tnum">
                            {formatCount(accepted)} / {formatCount(tasks.length)}
                          </span>
                        </div>
                        <Progress
                          className="mt-1.5"
                          value={accepted}
                          max={tasks.length}
                          tone="success"
                          label="Accepted share of tasks"
                        />
                      </div>

                      <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[32rem] border-collapse text-left text-body-sm">
                            <thead>
                              <tr className="border-b border-line text-caption uppercase tracking-[0.05em] text-ink-4">
                                <th scope="col" className="px-5 py-3 font-medium">
                                  Task
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                  Status
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                  Type
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                  Created
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {tasks.map((task) => (
                                <tr
                                  key={task.id}
                                  className="border-b border-line last:border-b-0"
                                >
                                  <td className="px-5 py-3 font-mono text-[12px] text-ink-3">
                                    {task.id.slice(0, 8)}…
                                  </td>
                                  <td className="px-5 py-3">
                                    <StatusChip status={task.status} />
                                  </td>
                                  <td className="px-5 py-3 text-ink-3">
                                    {task.is_gold ? "Gold" : "Standard"}
                                  </td>
                                  <td className="px-5 py-3 text-ink-3">
                                    {formatDate(task.created_at)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <InfoNote>
                        Contributor identity is never shown to buyers, and gold
                        answers are never returned by the API.
                      </InfoNote>
                    </>
                  );
                }}
              </QueryView>
            </section>

            <JobLifecycle job={job} onChanged={jobQuery.reload} />

            <section className="mt-6">
              <h2 className="font-display text-title text-ink">Delivery</h2>
              <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-display text-title text-ink">Dataset export</p>
                  <p className="mt-1 text-body-sm text-ink-3">
                    Export only the accepted annotation versions, with a
                    provenance manifest and no contributor identity.
                  </p>
                </div>
                <ButtonLink href={`/workspace/buyer/jobs/${job.id}/export`}>
                  <Download className="h-4 w-4" />
                  Export
                </ButtonLink>
              </div>
            </section>
          </>
        )}
      </QueryView>
    </>
  );
}
