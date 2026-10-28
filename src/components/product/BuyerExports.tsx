"use client";

import Link from "next/link";
import { useJobs } from "@/lib/api/live";
import { QueryView, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Download, FileText } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils/format";

/**
 * Exports index.
 *
 * The API has no "list export packages" endpoint — an export is generated per
 * job on demand. This screen therefore lists the buyer's real jobs and links to
 * each job's live export, rather than inventing a package history.
 */
export function BuyerExports() {
  const jobs = useJobs();

  return (
    <>
      <WorkspaceHeader
        eyebrow="Buyer"
        title="Exports"
        description="Exports are generated per job from its accepted annotation versions, with a provenance manifest and no contributor identity."
      />

      <QueryView
        query={jobs}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={FileText}
            title="No jobs yet"
            description="Once you have a job with accepted versions, its export is available here."
            action={<ButtonLink href="/workspace/buyer/new">Create a job</ButtonLink>}
          />
        }
      >
        {(list) => (
          <ul className="space-y-4">
            {list.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      href={`/workspace/buyer/jobs/${job.id}`}
                      className="font-medium text-ink hover:text-accent-700"
                    >
                      {job.title}
                    </Link>
                    <StatusChip status={job.status} />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-ink-4">{job.id}</p>
                  <p className="mt-1.5 text-caption text-ink-3">
                    {job.modality} · created {formatDate(job.created_at)}
                  </p>
                </div>
                <ButtonLink
                  href={`/workspace/buyer/jobs/${job.id}/export`}
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                >
                  <Download className="h-4 w-4" />
                  Export
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </QueryView>

      <InfoNote>
        Each export is generated on demand from the job&apos;s current accepted
        versions. The API does not retain a queryable history of past export
        packages, so none is shown here.
      </InfoNote>
    </>
  );
}
