"use client";

import Link from "next/link";
import { useReviewQueue } from "@/lib/api/live";
import { QueryView, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ArrowRight, Check } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Review queue.
 *
 * Reads the real queue of submissions awaiting a decision (tasks whose status
 * is `submitted`), oldest first. Validation results are not attached to a
 * queue item by the API, so this screen does not fabricate a "passed" flag; the
 * authoritative validation runs at submit time and any issues are surfaced
 * inside the review console.
 */
export function ReviewerQueue() {
  const queue = useReviewQueue();

  return (
    <>
      <WorkspaceHeader
        eyebrow="Reviewer"
        title="Review queue"
        description="Submissions awaiting a decision, oldest first. You cannot review your own work; each decision is recorded against the submission version."
      />

      <QueryView
        query={queue}
        isEmpty={(items) => items.length === 0}
        empty={
          <EmptyState
            icon={Check}
            title="The queue is clear"
            description="There are no submissions awaiting review right now. This reflects the live queue."
          />
        }
      >
        {(items) => {
          const flagged = items.filter((item) => item.is_fast_flag);
          const video = items.filter((item) => item.task.modality === "video");
          const image = items.filter((item) => item.task.modality === "image");

          return (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Awaiting decision" value={String(items.length)} hint="All modalities" />
                <Stat
                  label="Video / image"
                  value={`${video.length} / ${image.length}`}
                  hint="By task modality"
                  tone="muted"
                />
                <Stat
                  label="Fast-submission flags"
                  value={String(flagged.length)}
                  hint="Submitted suspiciously quickly"
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
                          Modality
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Version
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Submitted
                        </th>
                        <th scope="col" className="px-5 py-3 font-medium">
                          Flags
                        </th>
                        <th scope="col" className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-line last:border-b-0">
                          <td className="px-5 py-4 align-top">
                            <span className="text-ink">{item.job.title}</span>
                            <span className="mt-0.5 block font-mono text-[11px] text-ink-4">
                              task {item.task.id.slice(0, 8)}…
                            </span>
                          </td>
                          <td className="px-5 py-4 align-top capitalize text-ink-3">
                            {item.task.modality}
                          </td>
                          <td className="px-5 py-4 align-top text-ink-3">v{item.version}</td>
                          <td className="px-5 py-4 align-top text-ink-3">
                            {formatDateTime(item.submitted_at)}
                          </td>
                          <td className="px-5 py-4 align-top">
                            {item.is_fast_flag ? (
                              <Badge tone="outline" className="border-danger-line text-danger-fg">
                                Fast flag
                              </Badge>
                            ) : (
                              <span className="text-caption text-ink-4">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right align-top">
                            <Link
                              href={`/workspace/reviewer/review/${item.task.id}`}
                              className="inline-flex items-center gap-1 text-caption font-medium text-accent-700 hover:underline"
                            >
                              Review
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <InfoNote>
                A task leaves this queue only when a decision moves it out of the
                `submitted` state. Rejections and revision requests both create a
                review record tied to the exact submission version.
              </InfoNote>
            </>
          );
        }}
      </QueryView>
    </>
  );
}
