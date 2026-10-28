"use client";

import Link from "next/link";
import { useJobTasks, useJobs } from "@/lib/api/live";
import { LoadingBlock, QueryView, ErrorBlock, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";
import { Progress } from "@/components/product/Progress";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileText } from "@/components/ui/icons";
import { formatCount, formatPercent } from "@/lib/utils/format";
import type { Task } from "@/lib/api/platform";

const countBy = (tasks: Task[], statuses: Task["status"][]) =>
  tasks.filter((task) => statuses.includes(task.status)).length;

/**
 * Per-job quality, computed from real task states.
 *
 * The API exposes no precomputed quality metric, so this derives acceptance
 * from the job's tasks: acceptance rate is accepted ÷ reviewed, and it reports
 * "Not enough data" when nothing has been reviewed yet rather than showing a
 * flattering zero.
 */
function JobQualityRow({ jobId, title }: { jobId: string; title: string }) {
  const tasksQuery = useJobTasks(jobId);

  if (tasksQuery.status === "loading") {
    return <LoadingBlock label="Reading task states…" />;
  }
  if (tasksQuery.status === "error") {
    return <ErrorBlock error={tasksQuery.error} />;
  }

  const tasks = tasksQuery.data;
  const accepted = countBy(tasks, ["accepted", "paid"]);
  const rejected = countBy(tasks, ["rejected", "appealed"]);
  const revised = countBy(tasks, ["needs_revision"]);
  const reviewed = accepted + rejected + revised;

  return (
    <li className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/workspace/buyer/jobs/${jobId}`}
          className="font-medium text-ink hover:text-accent-700"
        >
          {title}
        </Link>
        <span className="text-caption text-ink-4">
          {formatCount(tasks.length)} tasks · {formatCount(reviewed)} reviewed
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ["Accepted", accepted],
            ["Needs revision", revised],
            ["Rejected", rejected],
            ["Unreviewed", countBy(tasks, ["available", "claimed", "draft", "submitted"])],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-caption text-ink-4">{label}</dt>
            <dd className="mt-1 font-display text-[1.25rem] text-ink tnum">
              {formatCount(value)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <div className="flex justify-between text-caption text-ink-4">
          <span>Acceptance rate</span>
          <span className="tnum">
            {reviewed === 0 ? "Not enough data" : formatPercent(accepted / reviewed)}
          </span>
        </div>
        <Progress
          className="mt-1.5"
          value={accepted}
          max={Math.max(reviewed, 1)}
          tone="success"
          label={`Acceptance rate for ${title}`}
        />
      </div>
    </li>
  );
}

export function BuyerQuality() {
  const jobs = useJobs();

  return (
    <>
      <WorkspaceHeader
        eyebrow="Buyer"
        title="Quality"
        description="Acceptance is computed from real review outcomes. Every figure states its sample; where nothing has been reviewed, it says so rather than showing a number."
      />

      <QueryView
        query={jobs}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={FileText}
            title="No jobs to assess"
            description="Quality is derived from review decisions on your jobs. Create a job first."
          />
        }
      >
        {(list) => (
          <ul className="space-y-4">
            {list.map((job) => (
              <JobQualityRow key={job.id} jobId={job.id} title={job.title} />
            ))}
          </ul>
        )}
      </QueryView>

      <InfoNote>
        We deliberately do not publish a single composite reputation score: a
        single number hides the sample size behind it. Acceptance is broken out
        per job, and unreviewed work is counted separately.
      </InfoNote>
    </>
  );
}
