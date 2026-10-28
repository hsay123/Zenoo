"use client";

import Link from "next/link";
import { useAction, useClientQuery, useJob, useJobTasks } from "@/lib/api/live";
import { QueryView, ErrorBlock, InlineError, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Download, Lock } from "@/components/ui/icons";
import { formatCount } from "@/lib/utils/format";
import {
  exportManifestSchema,
  platformPaths,
  type ExportManifest,
} from "@/lib/api/platform";

const FORMATS = [
  { id: "json", label: "JSON", note: "COCO-style for images; records array for video." },
  { id: "jsonl", label: "JSONL", note: "One JSON object per line, manifest first." },
  { id: "csv", label: "CSV", note: "Flattened rows, one per box or segment." },
] as const;

type ExportFormat = (typeof FORMATS)[number]["id"];

const acceptedStatuses = ["accepted", "paid"] as const;

export function BuyerJobExport({ jobId }: { jobId: string }) {
  const jobQuery = useJob(jobId);
  const tasksQuery = useJobTasks(jobId);
  const { run, pending, error } = useAction();

  // Read the real export once (JSON) to surface its provenance manifest.
  const manifestQuery = useClientQuery<ExportManifest>(
    `export-manifest:${jobId}`,
    async (client) => {
      const { blob } = await client.download(
        `${platformPaths.jobExport(jobId)}?format=json`,
      );
      const parsed = JSON.parse(await blob.text()) as { manifest?: unknown };
      return exportManifestSchema.parse(parsed.manifest);
    },
  );

  const download = (format: ExportFormat) =>
    run(async (client) => {
      const { blob, filename } = await client.download(
        `${platformPaths.jobExport(jobId)}?format=${format}`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename ?? `export.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return true;
    });

  const acceptedCount =
    tasksQuery.status === "ready"
      ? tasksQuery.data.filter((task) =>
          (acceptedStatuses as readonly string[]).includes(task.status),
        ).length
      : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-5 text-caption text-ink-4">
        <Link href="/workspace/buyer" className="hover:text-ink">
          Dashboard
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <Link href={`/workspace/buyer/jobs/${jobId}`} className="hover:text-ink">
          {jobId}
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span>Export</span>
      </nav>

      <QueryView query={jobQuery}>
        {(job) => (
          <>
            <WorkspaceHeader
              eyebrow={`${job.id.slice(0, 8)}… · delivery`}
              title="Dataset export"
              description="Exports contain only accepted annotation versions, with a provenance manifest and no contributor identity. Every format is generated from the same frozen set."
              actions={<Badge tone="neutral">{job.modality}</Badge>}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label="Accepted versions"
                value={acceptedCount === null ? "—" : formatCount(acceptedCount)}
                hint="Included in the export"
              />
              <Stat
                label="Tasks"
                value={
                  tasksQuery.status === "ready"
                    ? formatCount(tasksQuery.data.length)
                    : "—"
                }
                hint="Total tasks on this job"
              />
              <Stat
                label="Status"
                value={job.status}
                hint="Only published jobs accept work"
              />
            </div>

            <section className="mt-6 rounded-xl border border-line bg-surface p-6">
              <h2 className="font-display text-title text-ink">Provenance manifest</h2>
              {manifestQuery.status === "loading" ? (
                <p className="mt-3 text-body-sm text-ink-3">Reading manifest…</p>
              ) : manifestQuery.status === "error" ? (
                <div className="mt-3">
                  <ErrorBlock error={manifestQuery.error} />
                </div>
              ) : (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                      ["Dataset", manifestQuery.data.dataset_id.slice(0, 8) + "…"],
                      ["Schema version", manifestQuery.data.schema_version],
                      ["Records", formatCount(manifestQuery.data.record_counts.total)],
                      ["Images", formatCount(manifestQuery.data.record_counts.image)],
                      ["Videos", formatCount(manifestQuery.data.record_counts.video)],
                      ["Asset hashes", formatCount(Object.keys(manifestQuery.data.asset_hashes).length)],
                      ["Rights reference", manifestQuery.data.rights_reference ?? "—"],
                      ["Review policy", manifestQuery.data.review_policy_version ?? "—"],
                      [
                        "Generated",
                        manifestQuery.data.export_time.replace("T", " ").slice(0, 19) + " UTC",
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                          {label}
                        </dt>
                        <dd className="mt-1 break-words text-body-sm font-medium text-ink">
                          {value}
                        </dd>
                      </div>
                  ))}
                </dl>
              )}
            </section>

            <section className="mt-6 rounded-xl border border-line bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-title text-ink">Download</h2>
                <div className="flex items-start gap-2.5">
                  <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
                  <p className="text-caption text-ink-3">
                    Authenticated download; the file streams directly from the
                    platform API.
                  </p>
                </div>
              </div>
              <ul className="mt-4 border-t border-line">
                {FORMATS.map((format) => (
                  <li
                    key={format.id}
                    className="flex flex-col gap-3 border-b border-line py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <code className="font-mono text-[13px] text-ink">
                        annotations.{format.id}
                      </code>
                      <p className="mt-1 text-caption text-ink-3">{format.note}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void download(format.id)}
                      disabled={pending}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
              {error ? (
                <div className="mt-4">
                  <InlineError error={error} />
                </div>
              ) : null}
              {acceptedCount === 0 ? (
                <p className="mt-4 text-caption text-ink-4">
                  No accepted versions yet — the manifest above will report zero
                  records until work is accepted.
                </p>
              ) : null}
            </section>

            <InfoNote>
              The export is built from accepted (and paid) tasks only, and never
              includes contributor identity data. Settlement state is included
              per record where it exists.
            </InfoNote>
          </>
        )}
      </QueryView>
    </>
  );
}
