"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction, useAvailableTasks, useClientQuery, useEarnings } from "@/lib/api/live";
import { QueryView, InfoNote, InlineError } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { ArrowRight, FileText } from "@/components/ui/icons";
import { formatDate, formatUsdc } from "@/lib/utils/format";
import { claimResultSchema, lockedWorkSchema, platformPaths } from "@/lib/api/platform";

/**
 * Contributor task queue.
 *
 * Reads the real available-task queue (`GET /api/tasks/available`) and the
 * contributor's own submission history (`GET /api/earnings`). Claiming calls
 * the atomic claim endpoint with an idempotency key, then opens the workspace.
 * The queue does not expose reward before claiming (the API returns no reward
 * on a task), so none is fabricated here; reward is credited on acceptance and
 * shown in Earnings.
 */
export function ContributorTasks() {
  const router = useRouter();
  const availableQuery = useAvailableTasks();
  const earningsQuery = useEarnings();
  const { run, pending, error } = useAction();

  const claim = async (taskId: string) => {
    const result = await run((client) =>
      client.post(claimResultSchema, platformPaths.claimTask(taskId), {
        idempotencyKey: `claim:${taskId}`,
      }),
    );
    if (result) router.push(`/workspace/contributor/tasks/${taskId}`);
  };

  const history = earningsQuery.status === "ready" ? earningsQuery.data.tasks : [];
  const revise = history.filter((task) => task.status === "needs_revision");
  const awaiting = history.filter((task) =>
    ["submitted", "appealed"].includes(task.status),
  );

  return (
    <>
      <WorkspaceHeader
        eyebrow="Contributor"
        title="Available tasks"
        description="Claims are atomic: once claimed, no one else can annotate the same task. Open work is saved as a draft until you submit it."
      />

      <div className="grid gap-4 sm:grid-cols-3">
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

      <section className="mt-8">
        <h2 className="font-display text-title text-ink">Open tasks</h2>
        <QueryView
          query={availableQuery}
          isEmpty={(tasks) => tasks.length === 0}
          empty={
            <div className="mt-4">
              <EmptyState
                icon={FileText}
                title="No tasks are available right now"
                description="Eligible tasks appear here when a buyer publishes a job with unclaimed media. This empty state reflects the live queue."
              />
            </div>
          }
        >
          {(tasks) => (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-line text-caption uppercase tracking-[0.05em] text-ink-4">
                      <th scope="col" className="px-5 py-3 font-medium">Task</th>
                      <th scope="col" className="px-5 py-3 font-medium">Job</th>
                      <th scope="col" className="px-5 py-3 font-medium">Modality</th>
                      <th scope="col" className="px-5 py-3 font-medium">Type</th>
                      <th scope="col" className="px-5 py-3 font-medium">Listed</th>
                      <th scope="col" className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id} className="border-b border-line last:border-b-0">
                        <td className="px-5 py-4 align-top font-mono text-[12px] text-ink-3">
                          {task.id.slice(0, 8)}…
                        </td>
                        <td className="px-5 py-4 align-top font-mono text-[12px] text-ink-3">
                          {task.job_id.slice(0, 8)}…
                        </td>
                        <td className="px-5 py-4 align-top capitalize text-ink-3">
                          {task.modality}
                        </td>
                        <td className="px-5 py-4 align-top text-ink-3">
                          {task.is_gold ? "Gold" : "Standard"}
                        </td>
                        <td className="px-5 py-4 align-top text-ink-3">
                          {formatDate(task.created_at)}
                        </td>
                        <td className="px-5 py-4 text-right align-top">
                          <button
                            type="button"
                            onClick={() => void claim(task.id)}
                            disabled={pending}
                            className="inline-flex items-center gap-1 text-caption font-medium text-accent-700 hover:underline disabled:opacity-50"
                          >
                            {pending ? "Claiming…" : "Claim"}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
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
