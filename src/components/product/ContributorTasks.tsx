"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  QUEUE_POLL_MS,
  useAction,
  useAvailableTasks,
  useClientQuery,
  useEarnings,
  useMyTasks,
} from "@/lib/api/live";
import { QueryView, InfoNote, InlineError } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { ArrowRight, FileText } from "@/components/ui/icons";
import { formatDate, formatDateTime, formatUsdc } from "@/lib/utils/format";
import { claimResultSchema, lockedWorkSchema, platformPaths } from "@/lib/api/platform";

/**
 * Contributor task queue.
 *
 * Reads the real available-task queue (`GET /api/tasks/available`), the work
 * the contributor already holds (`GET /api/tasks/mine`) and their submission
 * history (`GET /api/earnings`). The queue polls while the tab is visible so a
 * job published by an organization shows up without a manual reload.
 *
 * Claiming is per-row: only the row that was clicked says "Claiming…", and a
 * successful claim navigates straight into the workspace. `mine` is what makes
 * a claimed task reachable after the fact — claiming removes it from the
 * available queue by design.
 */
export function ContributorTasks() {
  const router = useRouter();
  const availableQuery = useAvailableTasks(undefined, {
    refetchIntervalMs: QUEUE_POLL_MS,
  });
  const mineQuery = useMyTasks({ refetchIntervalMs: QUEUE_POLL_MS });
  const earningsQuery = useEarnings();
  const { run, error } = useAction();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const refresh = () => {
    availableQuery.reload();
    mineQuery.reload();
  };

  const claim = async (taskId: string) => {
    setClaimingId(taskId);
    const result = await run((client) =>
      client.post(claimResultSchema, platformPaths.claimTask(taskId), {
        idempotencyKey: `claim:${taskId}`,
      }),
    );
    setClaimingId(null);
    if (result) router.push(`/workspace/contributor/tasks/${taskId}`);
  };

  const history = earningsQuery.status === "ready" ? earningsQuery.data.tasks : [];
  const revise = history.filter((task) => task.status === "needs_revision");
  const awaiting = history.filter((task) =>
    ["submitted", "appealed"].includes(task.status),
  );

  const openTasks = availableQuery.status === "ready" ? availableQuery.data : [];
  const myTasks = mineQuery.status === "ready" ? mineQuery.data : [];
  const refreshedLabel =
    availableQuery.refreshedAt !== null
      ? `${new Date(availableQuery.refreshedAt).toISOString().slice(11, 19)} UTC`
      : null;

  return (
    <>
      <WorkspaceHeader
        eyebrow="Contributor"
        title="Available tasks"
        description="Claims are atomic: once claimed, no one else can annotate the same task. Open work is saved as a draft until you submit it."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Available now"
          value={
            availableQuery.status === "ready"
              ? String(availableQuery.data.length)
              : "—"
          }
          hint="Published jobs, unclaimed"
        />
        <Stat
          label="In progress"
          value={mineQuery.status === "ready" ? String(mineQuery.data.length) : "—"}
          hint="Claimed or drafted by you"
        />
        <Stat
          label="Needs revision"
          value={String(revise.length)}
          hint="Returned for correction"
        />
        <Stat
          label="Awaiting outcome"
          value={String(awaiting.length)}
          hint="Submitted or under appeal"
          tone="muted"
        />
      </div>

      {error ? (
        <div className="mt-5">
          <InlineError error={error} />
        </div>
      ) : null}

      {revise.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-title text-ink">Resume your work</h2>
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {revise.map((task) => (
              <li key={task.task_id}>
                <article className="flex h-full flex-col rounded-xl border border-pending-line bg-surface p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[12px] text-ink-4">
                      {task.task_id.slice(0, 8)}…
                    </span>
                    <StatusChip status={task.status} />
                  </div>
                  <h3 className="mt-3 font-display text-title text-ink">
                    {task.job_title || "Task"}
                  </h3>
                  <p className="mt-2 text-body-sm text-pending-fg">
                    A correction was requested. Resubmitting creates a new
                    version; your prior version is kept.
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                    <span className="text-caption text-ink-4">
                      Submitted {formatDate(task.submitted_at)}
                    </span>
                    <ButtonLink
                      href={`/workspace/contributor/tasks/${task.task_id}`}
                      size="sm"
                    >
                      Open workspace
                      <ArrowRight className="h-4 w-4" />
                    </ButtonLink>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LockedWork />

      {myTasks.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-title text-ink">In progress</h2>
          <p className="mt-1 text-body-sm text-ink-3">
            Work you have already claimed. Drafts stay here until you submit
            them.
          </p>
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {myTasks.map((task) => (
              <li key={task.id}>
                <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-ink-4">
                      {task.id.slice(0, 8)}…
                    </span>
                    <StatusChip status={task.status} />
                  </div>
                  <h3 className="mt-3 font-display text-title text-ink">
                    {task.job_title || "Task"}
                  </h3>
                  <p className="mt-1.5 text-caption text-ink-3">
                    {task.is_gold ? "Qualification" : task.modality} ·{" "}
                    {task.reward_per_task
                      ? `${formatUsdc(task.reward_per_task)} on acceptance`
                      : "Reward shown on completion"}
                    {task.lease_expiry
                      ? ` · lease until ${formatDateTime(task.lease_expiry)}`
                      : null}
                  </p>
                  <div className="mt-4 flex items-center justify-end border-t border-line pt-4">
                    <ButtonLink
                      href={`/workspace/contributor/tasks/${task.id}`}
                      size="sm"
                    >
                      {task.status === "draft" ? "Continue draft" : "Continue"}
                      <ArrowRight className="h-4 w-4" />
                    </ButtonLink>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-title text-ink">Open tasks</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-fg"
                />
                Live queue · updates every {Math.round(QUEUE_POLL_MS / 1000)}s
              </span>
              {refreshedLabel ? <span>· last checked {refreshedLabel}</span> : null}
              {openTasks.length > 0 ? (
                <span>
                  · {openTasks.length} {openTasks.length === 1 ? "task" : "tasks"}
                </span>
              ) : null}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>

        <QueryView
          query={availableQuery}
          isEmpty={(tasks) => tasks.length === 0}
          empty={
            <div className="mt-4">
              <EmptyState
                icon={FileText}
                title="No tasks are available right now"
                description="Eligible tasks appear here when a buyer publishes a funded job with unclaimed media. This page checks the live queue automatically."
              />
            </div>
          }
        >
          {(tasks) => (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] border-collapse text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-line text-caption uppercase tracking-[0.05em] text-ink-4">
                      <th scope="col" className="px-5 py-3 font-medium">Job</th>
                      <th scope="col" className="px-5 py-3 font-medium">Reward</th>
                      <th scope="col" className="px-5 py-3 font-medium">Modality</th>
                      <th scope="col" className="px-5 py-3 font-medium">Labels</th>
                      <th scope="col" className="px-5 py-3 font-medium">Listed</th>
                      <th scope="col" className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => {
                      const claiming = claimingId === task.id;
                      const labels = task.label_list ?? [];
                      return (
                        <tr key={task.id} className="border-b border-line last:border-b-0">
                          <td className="px-5 py-4 align-top">
                            <p className="font-medium text-ink">
                              {task.job_title || "Untitled job"}
                            </p>
                            <p className="mt-0.5 font-mono text-[12px] text-ink-4">
                              {task.id.slice(0, 8)}… ·{" "}
                              {task.is_gold ? "Qualification" : "Standard"}
                            </p>
                          </td>
                          <td className="px-5 py-4 align-top text-ink-2">
                            {task.reward_per_task
                              ? formatUsdc(task.reward_per_task)
                              : "—"}
                          </td>
                          <td className="px-5 py-4 align-top capitalize text-ink-3">
                            {task.modality}
                          </td>
                          <td className="px-5 py-4 align-top text-caption text-ink-3">
                            {labels.length === 0
                              ? "—"
                              : `${labels.slice(0, 3).join(", ")}${
                                  labels.length > 3 ? ` +${labels.length - 3}` : ""
                                }`}
                          </td>
                          <td className="px-5 py-4 align-top text-caption text-ink-3">
                            {formatDate(task.created_at)}
                          </td>
                          <td className="px-5 py-4 text-right align-top">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void claim(task.id)}
                              disabled={claimingId !== null}
                              aria-busy={claiming}
                            >
                              {claiming ? (
                                <span className="animate-pulse">Claiming…</span>
                              ) : (
                                <>
                                  Claim
                                  <ArrowRight className="h-4 w-4" />
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </QueryView>
      </section>

      <InfoNote>
        A claim places a lease on the task. If a lease expires without a
        submission, the task is released back to the queue. Reward is credited on
        acceptance and appears in{" "}
        <Link href="/workspace/contributor/earnings" className="underline hover:text-ink-2">
          Earnings
        </Link>
        .
      </InfoNote>
    </>
  );
}

/**
 * Paid work the contributor's tier cannot claim yet, with what unlocks it.
 * New contributors used to see an empty list with no idea that paid jobs
 * existed; claiming stays gated server-side exactly as before.
 */
function LockedWork() {
  const query = useClientQuery("locked-work", (client) => client.get(lockedWorkSchema, platformPaths.lockedTasks()));
  const data = query.status === "ready" ? query.data : null;
  if (!data || data.locked.length === 0) return null;
  const tierName = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <section className="mt-8 rounded-xl border border-pending-line bg-pending-bg p-5">
      <h2 className="font-display text-title text-ink">Paid work waiting for you</h2>
      <p className="mt-1 text-body-sm text-ink-2">
        You are <strong>{tierName(data.tier)}</strong>.{" "}
        {data.next
          ? `To reach ${tierName(data.next.tier)}: ${data.next.needs.join("; ")}.`
          : null}{" "}
        {data.tier === "new" ? "Start with the qualification tasks in Open tasks below." : null}
      </p>
      <ul className="mt-4 divide-y divide-pending-line rounded-lg border border-pending-line bg-surface">
        {data.locked.map((job) => (
          <li key={job.job_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{job.title}</p>
              <p className="text-caption text-ink-3">
                {job.modality === "video" ? "Video" : "Image"} · {formatUsdc(job.reward_per_task)} per accepted task ·{" "}
                {job.open_tasks} open {job.open_tasks === 1 ? "task" : "tasks"}
                {job.labels.length ? ` · ${job.labels.slice(0, 5).join(", ")}` : ""}
              </p>
            </div>
            <span className="rounded-full border border-pending-line px-2.5 py-1 text-caption text-pending-fg">
              Unlocks at {tierName(job.unlocks_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
