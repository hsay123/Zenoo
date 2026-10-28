"use client";

import Link from "next/link";
import { useJobs } from "@/lib/api/live";
import { QueryView } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { ButtonLink } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRight, Database, Info } from "@/components/ui/icons";
import { formatDate, formatMon } from "@/lib/utils/format";
import type { Job } from "@/lib/api/platform";

const byStatus = (jobs: Job[], status: Job["status"]) =>
  jobs.filter((job) => job.status === status).length;

/**
 * Buyer dashboard.
 *
 * Reads the signed-in buyer's real jobs from `GET /api/jobs`. Only figures the
 * API actually returns are shown: job status, modality, per-task reward and
 * budget. Per-job task progress and quality are shown on the job detail, where
 * the underlying tasks can be read.
 */
export function BuyerDashboard() {
  const jobsQuery = useJobs();

  return (
    <>
      <WorkspaceHeader
        eyebrow="Buyer"
        title="Dashboard"
        description="Your jobs, straight from the platform API. Define a job, add media, generate tasks and publish — nothing is claimable until the job is published."
        actions={<ButtonLink href="/workspace/buyer/new">New job</ButtonLink>}
      />

      <QueryView
        query={jobsQuery}
        isEmpty={(jobs) => jobs.length === 0}
        empty={
          <div className="mt-6">
            <EmptyState
              icon={Database}
              title="No jobs yet"
              description="Create a project, upload media and define a job. It appears here as a draft until you publish it."
              action={<ButtonLink href="/workspace/buyer/new">Create your first job</ButtonLink>}
            />
          </div>
        }
      >
        {(jobs) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Published"
                value={String(byStatus(jobs, "published"))}
                hint={`${jobs.length} total`}
              />
              <Stat label="Draft" value={String(byStatus(jobs, "draft"))} hint="Not yet claimable" />
              <Stat label="Paused" value={String(byStatus(jobs, "paused"))} hint="Claims blocked" />
              <Stat label="Closed" value={String(byStatus(jobs, "closed"))} hint="No new claims" />
            </div>

            <section className="mt-8">
              <h2 className="font-display text-title text-ink">Jobs</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] border-collapse text-left text-body-sm">
                    <thead>
                      <tr className="border-b border-line text-caption uppercase tracking-[0.05em] text-ink-4">
                        <th scope="col" className="px-5 py-3 font-medium">Job</th>
                        <th scope="col" className="px-5 py-3 font-medium">Status</th>
                        <th scope="col" className="px-5 py-3 font-medium">Modality</th>
                        <th scope="col" className="px-5 py-3 text-right font-medium">Reward / task</th>
                        <th scope="col" className="px-5 py-3 text-right font-medium">Budget</th>
                        <th scope="col" className="px-5 py-3 font-medium">Deadline</th>
                        <th scope="col" className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => (
                        <tr key={job.id} className="border-b border-line last:border-b-0">
                          <td className="px-5 py-4 align-top">
                            <Link
                              href={`/workspace/buyer/jobs/${job.id}`}
                              className="font-medium text-ink hover:text-accent-700"
                            >
                              {job.title}
                            </Link>
                            <p className="mt-0.5 font-mono text-[11px] text-ink-4">
                              {job.id}
                            </p>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <StatusChip status={job.status} />
                          </td>
                          <td className="px-5 py-4 align-top capitalize text-ink-3">
                            {job.modality}
                          </td>
                          <td className="px-5 py-4 text-right align-top tabular-nums text-ink-2">
                            {formatMon(job.reward_per_task)}
                          </td>
                          <td className="px-5 py-4 text-right align-top tabular-nums text-ink-2">
                            {formatMon(job.budget)}
                          </td>
                          <td className="px-5 py-4 align-top text-ink-3">
                            {job.deadline ? formatDate(job.deadline) : "—"}
                          </td>
                          <td className="px-5 py-4 text-right align-top">
                            <Link
                              href={`/workspace/buyer/jobs/${job.id}`}
                              className="inline-flex items-center gap-1 text-caption font-medium text-accent-700 hover:underline"
                            >
                              Open
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <p className="mt-6 flex items-start gap-2 text-caption text-ink-4">
              <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Quality and settlement figures are computed from real review and
              settlement records; they appear on the job detail once work has been
              accepted. This product does not fabricate metrics.
            </p>
          </>
        )}
      </QueryView>
    </>
  );
}
