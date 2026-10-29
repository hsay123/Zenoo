"use client";

import { useMemo, useState } from "react";
import { useAction, useReviewQueue, useTask } from "@/lib/api/live";
import { QueryView, InlineError, InfoNote } from "@/components/product/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Check } from "@/components/ui/icons";
import { formatTimecode } from "@/lib/utils/format";
import {
  platformPaths,
  reviewDecisionResultSchema,
  type BoundingBox,
  type PlatformError,
  type Review,
} from "@/lib/api/platform";

type Decision = "accept" | "revise" | "reject";

const REASON_CODES: Record<Decision, { value: string; label: string }[]> = {
  accept: [{ value: "ACCEPTED", label: "Meets the rubric" }],
  revise: [
    { value: "WRONG_CLASS", label: "Wrong class" },
    { value: "IMPRECISE_TIMING", label: "Imprecise timing" },
    { value: "MISSING_OBJECTS", label: "Missing objects" },
    { value: "INCONSISTENT_LABELS", label: "Inconsistent labels" },
    { value: "SEGMENT_OVERLAP", label: "Overlapping segments" },
    { value: "SEGMENT_ORDER", label: "Out-of-order segments" },
    { value: "BOX_OUT_OF_BOUNDS", label: "Box out of bounds" },
    { value: "LOW_QUALITY", label: "Low quality" },
    { value: "RUBRIC_VIOLATION", label: "Rubric violation" },
  ],
  reject: [
    { value: "RUBRIC_VIOLATION", label: "Rubric violation" },
    { value: "LOW_QUALITY", label: "Low quality / unusable" },
    { value: "DUPLICATE_PAYLOAD", label: "Duplicate submission" },
    { value: "FAST_SUBMISSION_FLAG", label: "Submitted without care" },
  ],
};

const CONFIDENCE_OPTIONS = [
  { value: "", label: "Not stated" },
  { value: "0.25", label: "0.25 — low" },
  { value: "0.5", label: "0.5 — medium" },
  { value: "0.75", label: "0.75 — high" },
  { value: "1", label: "1.0 — certain" },
];

function ValidationDetails({ error }: { error: PlatformError }) {
  const details = error.details;
  if (!Array.isArray(details) || details.length === 0) return <InlineError error={error} />;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger-line bg-danger-bg p-3 text-caption text-danger-fg"
    >
      <p className="font-medium">{error.message}</p>
      <ul className="mt-2 space-y-1">
        {details.slice(0, 8).map((issue, index) => {
          const record = issue as { path?: unknown[]; message?: string };
          const path = Array.isArray(record.path) ? record.path.join(".") : "payload";
          return (
            <li key={`${path}-${index}`} className="flex gap-2">
              <code className="font-mono text-[11px] opacity-80">{path}</code>
              <span>{record.message ?? "Invalid value"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ImageOverlay({ src, boxes }: { src: string; boxes: BoundingBox[] }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-line bg-night">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Submitted media"
        className="block h-auto w-full"
        onLoad={(event) =>
          setNatural({
            w: event.currentTarget.naturalWidth,
            h: event.currentTarget.naturalHeight,
          })
        }
      />
      {natural
        ? boxes.map((box, index) => (
            <div
              key={index}
              className="pointer-events-none absolute rounded-sm border-2 border-accent-400 bg-accent-500/15"
              style={{
                left: `${(box.x / natural.w) * 100}%`,
                top: `${(box.y / natural.h) * 100}%`,
                width: `${(box.w / natural.w) * 100}%`,
                height: `${(box.h / natural.h) * 100}%`,
              }}
            >
              <span className="absolute -top-5 left-0 rounded-sm bg-night/80 px-1 font-mono text-[10px] text-white">
                {box.class}
              </span>
            </div>
          ))
        : null}
    </div>
  );
}

export function ReviewConsole({ taskId }: { taskId: string }) {
  const queue = useReviewQueue();
  const taskQuery = useTask(taskId);
  const { run, pending, error } = useAction();

  const [decision, setDecision] = useState<Decision>("accept");
  const [reasonCode, setReasonCode] = useState<string>("ACCEPTED");
  const [confidence, setConfidence] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<Review | null>(null);

  const item = useMemo(() => {
    if (queue.status !== "ready") return null;
    return queue.data.find((entry) => entry.task.id === taskId) ?? null;
  }, [queue, taskId]);

  const chooseDecision = (value: Decision) => {
    setDecision(value);
    setReasonCode(REASON_CODES[value][0].value);
  };

  const decide = async () => {
    if (!item) return;
    const result = await run((client) =>
      client.post(reviewDecisionResultSchema, platformPaths.reviewDecision(item.id), {
        body: {
          decision,
          reason_code: reasonCode,
          confidence: confidence === "" ? undefined : Number(confidence),
          notes: notes.trim() || undefined,
        },
        idempotencyKey: `review:${item.id}`,
      }),
    );
    if (result) {
      setDone(result.review);
      queue.reload();
    }
  };

  // A recorded decision moves the task out of the queue, so render the success
  // state before the "not in your queue" guard (otherwise the reload would hide
  // the confirmation the reviewer just earned).
  if (done) {
    return (
      <div className="rounded-xl border border-success-line bg-success-bg p-6">
        <p className="flex items-center gap-2 font-medium text-success-fg">
          <Check className="h-4 w-4" />
          Decision recorded
        </p>
        <p className="mt-1.5 max-w-xl text-body-sm text-success-fg">
          This submission was <span className="font-medium">{done.decision}</span> (
          {done.reason_code}). The task has left the review queue according to the
          outcome.
        </p>
        <ButtonLink
          href="/workspace/reviewer"
          variant="secondary"
          size="sm"
          className="mt-3"
        >
          Back to queue
        </ButtonLink>
      </div>
    );
  }

  return (
    <QueryView query={queue}>
      {() => {
        if (!item) {
          return (
            <div className="rounded-xl border border-line bg-surface p-6">
              <p className="font-display text-title text-ink">Not in your queue</p>
              <p className="mt-2 max-w-xl text-body-sm text-ink-3">
                This task has no submission awaiting review — it may already have
                been decided, or it was never submitted. Return to the queue for
                the current list.
              </p>
              <ButtonLink href="/workspace/reviewer" className="mt-4" variant="secondary">
                Back to queue
              </ButtonLink>
            </div>
          );
        }

        const payload = item.payload;
        const mediaUrl = taskQuery.status === "ready" ? taskQuery.data.signed_media_url : undefined;

        return (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <div className="rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] text-ink-4">
                      submission {item.id.slice(0, 8)}… · task {item.task.id.slice(0, 8)}…
                    </p>
                    <h2 className="mt-1 truncate font-display text-title text-ink">
                      {item.job.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">v{item.version}</Badge>
                    <StatusChip status={item.task.status} />
                  </div>
                </div>

                <div className="mt-4">
                  {!mediaUrl ? (
                    <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center text-body-sm text-ink-3">
                      {taskQuery.status === "error"
                        ? "Media could not be loaded for this task."
                        : "Loading media…"}
                    </div>
                  ) : item.task.modality === "video" ? (
                    <video
                      src={mediaUrl}
                      controls
                      className="aspect-video w-full rounded-lg border border-line bg-night"
                    />
                  ) : (
                    <ImageOverlay
                      src={mediaUrl}
                      boxes={payload.schema_version === "image-boxes-v1" ? payload.boxes : []}
                    />
                  )}
                </div>
              </div>

              <div className="mt-6">
                <h2 className="font-display text-title text-ink">Submitted annotation</h2>
                <div className="mt-3">
                  {payload.schema_version === "action-segments-v1" ? (
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {payload.segments.map((segment, index) => (
                        <li
                          key={index}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-body-sm"
                        >
                          <span className="font-mono text-[12px] text-ink-4">
                            segments[{index}]
                          </span>
                          <span className="font-mono text-[12px] text-ink-3">
                            {formatTimecode(segment.start_ms)}–{formatTimecode(segment.end_ms)}
                          </span>
                          <span className="font-medium capitalize text-ink">
                            {segment.action_label}
                          </span>
                          <span className="capitalize text-ink-3">{segment.outcome}</span>
                          {segment.object ? (
                            <span className="text-ink-3">object: {segment.object}</span>
                          ) : null}
                          {segment.failure_reason ? (
                            <span className="text-danger-fg">failure: {segment.failure_reason}</span>
                          ) : null}
                          <span className="ml-auto text-caption text-ink-4">
                            confidence {segment.confidence}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {payload.boxes.map((box, index) => (
                        <li
                          key={index}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-body-sm"
                        >
                          <span className="font-mono text-[12px] text-ink-4">boxes[{index}]</span>
                          <span className="font-medium capitalize text-ink">{box.class}</span>
                          <span className="font-mono text-[12px] text-ink-3">
                            x{box.x} y{box.y} w{box.w} h{box.h}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <aside className="lg:col-span-5">
              <div className="sticky top-32 space-y-5">
                <div className="rounded-xl border border-line bg-surface p-5">
                    <h2 className="font-display text-title text-ink">Decision</h2>
                    <p className="mt-1.5 text-body-sm text-ink-3">
                      Compare the annotation to the media, then record a decision.
                      Every decision is tied to this submission version.
                    </p>

                    <fieldset className="mt-4">
                      <legend className="text-caption text-ink-3">Outcome</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(["accept", "revise", "reject"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => chooseDecision(value)}
                            className={
                              decision === value
                                ? "rounded-md border border-accent-500 bg-accent-50 px-3.5 py-2 text-body-sm font-medium text-accent-800"
                                : "rounded-md border border-line-strong bg-surface px-3.5 py-2 text-body-sm text-ink-2 hover:border-ink-4"
                            }
                          >
                            {value === "revise" ? "Request revision" : value[0].toUpperCase() + value.slice(1)}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <label className="mt-4 flex flex-col gap-1.5">
                      <span className="text-caption text-ink-3">Reason code</span>
                      <select
                        value={reasonCode}
                        onChange={(event) => setReasonCode(event.target.value)}
                        className="h-10 rounded-md border border-line-strong bg-surface px-3 text-body-sm text-ink focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
                      >
                        {REASON_CODES[decision].map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label} ({reason.value})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="mt-4 flex flex-col gap-1.5">
                      <span className="text-caption text-ink-3">Confidence</span>
                      <select
                        value={confidence}
                        onChange={(event) => setConfidence(event.target.value)}
                        className="h-10 rounded-md border border-line-strong bg-surface px-3 text-body-sm text-ink focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
                      >
                        {CONFIDENCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-4">
                      <TextAreaField
                        id="decision-notes"
                        label="Notes"
                        rows={3}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Optional. Shown to the contributor when a revision is requested."
                      />
                    </div>

                    <Button
                      className="mt-4 w-full"
                      type="button"
                      onClick={() => void decide()}
                      disabled={pending}
                    >
                      {pending ? "Recording…" : "Record decision"}
                    </Button>

                    {error ? (
                      <div className="mt-3">
                        <ValidationDetails error={error} />
                      </div>
                    ) : null}
                  </div>

                <InfoNote>
                  You cannot review your own submission; the platform rejects a
                  self-review. The reason code is stored on the review record and
                  is what the contributor sees on a revision request.
                </InfoNote>
              </div>
            </aside>
          </div>
        );
      }}
    </QueryView>
  );
}
