"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QueryView, InlineError, InfoNote } from "@/components/product/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { AlertTriangle, Check, Info } from "@/components/ui/icons";
import {
  clampBox,
  cornerAt,
  fractionToMs,
  hitTestBoxes,
  naturalScale,
  resizeBox,
  segmentBar,
  timeFraction,
  moveBox,
  type Bounds,
  type Box,
  type ResizeHandle,
} from "@/lib/annotation/geometry";
import { formatDateTime, formatTimecode } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { useAction, useTask, useWorkPayload } from "@/lib/api/live";
import {
  draftSaveResultSchema,
  platformPaths,
  submissionSchema,
  type ActionSegment,
  type AnnotationPayload,
  type BoundingBox,
  type PlatformError,
  type Submission,
  type Task,
  type WorkPayload,
} from "@/lib/api/platform";

const ACTIONS = [
  "reach",
  "grasp",
  "lift",
  "place",
  "inspect",
  "recover",
  "write",
  "other",
] as const;
const OUTCOMES = ["success", "partial", "failure", "unknown"] as const;
const CONFIDENCE = [1, 2, 3, 4, 5] as const;

type ActionLabel = (typeof ACTIONS)[number];
type Outcome = (typeof OUTCOMES)[number];

type DraftSegment = ActionSegment & { id: string };
type DraftBox = BoundingBox & { id: string };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Drop the client-side `id` used for React keys before sending a payload. */
function stripId<T extends { id: string }>(item: T): Omit<T, "id"> {
  const copy: { id?: string } = { ...item };
  delete copy.id;
  return copy as Omit<T, "id">;
}

const EDITABLE_STATUSES = ["claimed", "draft", "needs_revision"];

/** Render the field-level validation issues carried on a 422 error. */
function ValidationDetails({ error }: { error: PlatformError }) {
  const details = error.details;
  if (!Array.isArray(details) || details.length === 0) {
    return <InlineError error={error} />;
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-danger-line bg-danger-bg p-3 text-caption text-danger-fg"
    >
      <p className="font-medium">{error.message}</p>
      <ul className="mt-2 space-y-1">
        {details.slice(0, 8).map((issue, index) => {
          const record = issue as { path?: unknown[]; message?: string; code?: string };
          const path = Array.isArray(record.path) ? record.path.join(".") : "";
          return (
            <li key={`${path}-${index}`} className="flex gap-2">
              <code className="font-mono text-[11px] opacity-80">{path || "payload"}</code>
              <span>{record.message ?? "Invalid value"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AnnotationWorkspace({ taskId }: { taskId: string }) {
  const taskQuery = useTask(taskId);
  const workQuery = useWorkPayload(taskId);

  const reload = () => {
    taskQuery.reload();
    workQuery.reload();
  };

  return (
    <QueryView query={taskQuery}>
      {(task) => (
        <QueryView query={workQuery}>
          {(work) => (
            <WorkspaceInner
              key={task.id}
              task={task}
              taskId={taskId}
              work={work}
              onReload={reload}
            />
          )}
        </QueryView>
      )}
    </QueryView>
  );
}

function WorkspaceInner({
  task,
  taskId,
  work,
  onReload,
}: {
  task: Task;
  taskId: string;
  work: WorkPayload;
  onReload: () => void;
}) {
  const { run, pending, error } = useAction();
  const submitKey = useRef(newId());

  const initial = work.payload;
  const [segments, setSegments] = useState<DraftSegment[]>(() =>
    initial?.schema_version === "action-segments-v1"
      ? initial.segments.map((segment) => ({ ...segment, id: newId() }))
      : [],
  );
  const [boxes, setBoxes] = useState<DraftBox[]>(() =>
    initial?.schema_version === "image-boxes-v1"
      ? initial.boxes.map((box) => ({ ...box, id: newId() }))
      : [],
  );
  const [activeClass, setActiveClass] = useState<string>(task.label_list?.[0] ?? "other");
  const [natural, setNatural] = useState<Bounds | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(work.saved_at);
  const [result, setResult] = useState<Submission | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const editable = EDITABLE_STATUSES.includes(task.status);
  const labels = useMemo(() => task.label_list ?? [], [task.label_list]);
  const loadedFrom = work.source;

  /**
   * A fingerprint of the annotation itself, so autosave reacts to real content
   * changes rather than to every render. `savedFingerprint` records what the
   * platform last acknowledged — that is what makes "saved" mean saved and not
   * just "typed".
   */
  const fingerprint = useMemo(
    () => JSON.stringify(task.modality === "video" ? segments.map(stripId) : boxes.map(stripId)),
    [task.modality, segments, boxes],
  );
  const savedFingerprint = useRef<string | null>(null);
  const saveDraftRef = useRef<((mode?: "manual" | "autosave") => Promise<void>) | null>(null);
  const buildPayload = (): AnnotationPayload =>
    task.modality === "video"
      ? {
          task_id: task.id,
          asset_id: task.asset_id,
          schema_version: "action-segments-v1",
          segments: segments.map(stripId),
        }
      : {
          task_id: task.id,
          asset_id: task.asset_id,
          schema_version: "image-boxes-v1",
          boxes: boxes.map(stripId),
        };

  const issues = useMemo(() => {
    const list: { path: string; message: string }[] = [];
    if (task.modality === "video") {
      segments.forEach((segment, index) => {
        if (segment.end_ms <= segment.start_ms) {
          list.push({
            path: `segments[${index}].end_ms`,
            message: "End must be after start.",
          });
        }
        if (segment.outcome === "failure" && !segment.failure_reason?.trim()) {
          list.push({
            path: `segments[${index}].failure_reason`,
            message: "A failure outcome requires a reason.",
          });
        }
      });
      for (let i = 1; i < segments.length; i += 1) {
        if (segments[i].start_ms < segments[i - 1].start_ms) {
          list.push({ path: `segments[${i}].start_ms`, message: "Segments must be ordered." });
        } else if (segments[i].start_ms < segments[i - 1].end_ms) {
          list.push({ path: `segments[${i}].start_ms`, message: "Segments must not overlap." });
        }
      }
      if (segments.length === 0) list.push({ path: "segments", message: "Add at least one segment." });
    } else {
      boxes.forEach((box, index) => {
        if (box.w <= 0 || box.h <= 0) {
          list.push({ path: `boxes[${index}]`, message: "Box size must be positive." });
        }
        if (
          natural &&
          (box.x < 0 || box.y < 0 || box.x + box.w > natural.w || box.y + box.h > natural.h)
        ) {
          list.push({ path: `boxes[${index}]`, message: "Box exceeds image bounds." });
        }
        if (labels.length > 0 && !labels.includes(box.class)) {
          list.push({
            path: `boxes[${index}].class`,
            message: `"${box.class}" is not an allowed label.`,
          });
        }
      });
    }
    return list;
  }, [task.modality, segments, boxes, labels, natural]);

  const empty = task.modality === "video" ? segments.length === 0 : boxes.length === 0;
  const canSubmit = editable && issues.length === 0 && !empty && !pending;

  const saveDraft = async (mode: "manual" | "autosave" = "manual") => {
    if (mode === "manual") setNotice(null);
    if (mode === "autosave") setAutosave("saving");
    const payload = buildPayload();
    const saved = await run((client) =>
      client.put(draftSaveResultSchema, platformPaths.saveDraft(taskId), {
        body: payload,
        idempotencyKey: newId(),
      }),
    );
    if (saved) {
      setDirty(false);
      setSavedAt(saved.saved_at);
      savedFingerprint.current = fingerprint;
      if (mode === "manual") {
        setNotice("Draft saved to the platform.");
      } else {
        setAutosave("saved");
      }
    } else if (mode === "autosave") {
      setAutosave("error");
    }
  };

  useEffect(() => {
    saveDraftRef.current = saveDraft;
  });

  /**
   * Debounced autosave. It only fires once the editor content actually differs
   * from what the platform last acknowledged, and it never claims success: the
   * status text is driven by the real request outcome.
   */
  useEffect(() => {
    if (!editable || pending) return;
    if (savedFingerprint.current === null) {
      // First pass: the payload loaded from the platform is the baseline.
      savedFingerprint.current = fingerprint;
      return;
    }
    if (fingerprint === savedFingerprint.current) return;
    setAutosave("idle");
    const timer = setTimeout(() => {
      void saveDraftRef.current?.("autosave");
    }, 3000);
    return () => clearTimeout(timer);
  }, [fingerprint, editable, pending]);

  const submit = async () => {
    setNotice(null);
    const payload = buildPayload();
    const submission = await run((client) =>
      client.post(submissionSchema, platformPaths.submitTask(taskId), {
        body: payload,
        idempotencyKey: submitKey.current,
      }),
    );
    if (submission) {
      setResult(submission);
      setDirty(false);
      onReload();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-8">
        {!editable ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-info-line bg-info-bg p-4">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-fg" />
            <p className="text-caption text-info-fg">
              This task is <span className="font-medium">{task.status.replaceAll("_", " ")}</span>{" "}
              and is read-only here. The annotation shown is your most recent
              version; corrections can only be made while a task is returned for
              revision.
            </p>
          </div>
        ) : null}

        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[12px] text-ink-4">{task.id}</p>
              <h2 className="mt-1 truncate font-display text-title text-ink">
                {task.job_title ?? "Task"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">
                {task.modality === "video" ? "action-segments-v1" : "image-boxes-v1"}
              </Badge>
              <StatusChip status={task.status} />
            </div>
          </div>

          <div className="mt-4">
            {task.signed_media_url ? (
              task.modality === "video" ? (
                <div className="space-y-3">
                  <video
                    ref={videoRef}
                    src={task.signed_media_url}
                    controls
                    className="aspect-video w-full rounded-lg border border-line bg-night"
                    onLoadedMetadata={(event) => {
                      const seconds = event.currentTarget.duration;
                      setDurationMs(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0);
                    }}
                    onTimeUpdate={(event) =>
                      setPositionMs(Math.round(event.currentTarget.currentTime * 1000))
                    }
                    onSeeked={(event) =>
                      setPositionMs(Math.round(event.currentTarget.currentTime * 1000))
                    }
                  />
                  <Timeline
                    segments={segments}
                    durationMs={durationMs}
                    positionMs={positionMs}
                    selectedId={selectedSegmentId}
                    editable={editable}
                    onSelect={setSelectedSegmentId}
                    onSeek={(ms) => {
                      setPositionMs(ms);
                      const video = videoRef.current;
                      if (video) video.currentTime = ms / 1000;
                    }}
                    onSetBoundary={(edge) => {
                      if (durationMs <= 0) return;
                      setSegments((prev) => {
                        const target =
                          prev.find((item) => item.id === selectedSegmentId) ??
                          prev[prev.length - 1];
                        if (!target) return prev;
                        const ms = Math.min(Math.max(0, positionMs), durationMs);
                        const next =
                          edge === "start"
                            ? { ...target, start_ms: Math.min(ms, target.end_ms - 1) }
                            : { ...target, end_ms: Math.max(ms, target.start_ms + 1) };
                        return prev.map((item) => (item.id === target.id ? next : item));
                      });
                      setDirty(true);
                    }}
                  />
                </div>
              ) : (
                <ImageCanvas
                  src={task.signed_media_url}
                  boxes={boxes}
                  natural={natural}
                  editable={editable}
                  onResizeImage={setNatural}
                  onAddBox={(box) => {
                    setBoxes((prev) => [...prev, { ...box, id: newId(), class: activeClass }]);
                    setDirty(true);
                  }}
                  onUpdateBox={(id, box) => {
                    setBoxes((prev) =>
                      prev.map((item) => (item.id === id ? { ...item, ...box } : item)),
                    );
                    setDirty(true);
                  }}
                  activeClassControl={
                    <label className="flex items-center gap-2 text-caption text-ink-3">
                      Draw label
                      <select
                        value={activeClass}
                        onChange={(event) => setActiveClass(event.target.value)}
                        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-caption capitalize text-ink"
                      >
                        {(labels.length > 0 ? labels : ["other"]).map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  }
                />
              )
            ) : (
              <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center text-body-sm text-ink-3">
                The signed media URL is not available. Claim the task to load its
                media.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-title text-ink">
              {task.modality === "video" ? "Segments" : "Boxes"}
            </h2>
            {editable ? (
              task.modality === "video" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const last = segments[segments.length - 1];
                    const start = last ? last.end_ms : 0;
                    setSegments((prev) => [
                      ...prev,
                      {
                        id: newId(),
                        start_ms: start,
                        end_ms: start + 1000,
                        action_label: "reach",
                        outcome: "success",
                        confidence: 3,
                      },
                    ]);
                    setDirty(true);
                  }}
                >
                  Add segment
                </Button>
              ) : (
                <span className="text-caption text-ink-4">
                  Drag on the image to draw a box.
                </span>
              )
            ) : null}
          </div>

          {task.modality === "video" ? (
            <ul className="mt-4 space-y-3">
              {segments.map((segment, index) => (
                <li key={segment.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] text-ink-4">segments[{index}]</span>
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSegments((prev) => prev.filter((item) => item.id !== segment.id));
                          setDirty(true);
                        }}
                        className="text-caption text-ink-4 hover:text-danger-fg"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberField
                      label="Start (ms)"
                      value={segment.start_ms}
                      disabled={!editable}
                      onChange={(value) => {
                        setSegments((prev) =>
                          prev.map((item) =>
                            item.id === segment.id ? { ...item, start_ms: value } : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <NumberField
                      label="End (ms)"
                      value={segment.end_ms}
                      disabled={!editable}
                      onChange={(value) => {
                        setSegments((prev) =>
                          prev.map((item) =>
                            item.id === segment.id ? { ...item, end_ms: value } : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <SelectField
                      label="Action"
                      value={segment.action_label}
                      disabled={!editable}
                      options={ACTIONS.map((value) => ({ value, label: value }))}
                      onChange={(value) => {
                        setSegments((prev) =>
                          prev.map((item) =>
                            item.id === segment.id
                              ? { ...item, action_label: value as ActionLabel }
                              : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <SelectField
                      label="Outcome"
                      value={segment.outcome}
                      disabled={!editable}
                      options={OUTCOMES.map((value) => ({ value, label: value }))}
                      onChange={(value) => {
                        setSegments((prev) =>
                          prev.map((item) =>
                            item.id === segment.id ? { ...item, outcome: value as Outcome } : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <TextField
                      label="Object"
                      value={segment.object ?? ""}
                      disabled={!editable}
                      placeholder="e.g. red_block"
                      onChange={(value) => {
                        setSegments((prev) =>
                          prev.map((item) =>
                            item.id === segment.id
                              ? { ...item, object: value || undefined }
                              : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <TextField
                      label="Failure reason"
                      value={segment.failure_reason ?? ""}
                      disabled={!editable || segment.outcome !== "failure"}
                      placeholder="Required when outcome is failure"
                      onChange={(value) => {
                        setSegments((prev) =>
                          prev.map((item) =>
                            item.id === segment.id
                              ? { ...item, failure_reason: value || undefined }
                              : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <SelectField
                      label="Confidence"
                      value={String(segment.confidence)}
                      disabled={!editable}
                      options={CONFIDENCE.map((value) => ({
                        value: String(value),
                        label: String(value),
                      }))}
                      onChange={(value) => {
                        setSegments((prev) =>
                          prev.map((item) =>
                            item.id === segment.id
                              ? { ...item, confidence: Number(value) as 1 | 2 | 3 | 4 | 5 }
                              : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <div className="flex flex-col justify-end">
                      <span className="text-caption text-ink-4">
                        {formatTimecode(segment.start_ms)} → {formatTimecode(segment.end_ms)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-4 space-y-3">
              {boxes.map((box, index) => (
                <li key={box.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] text-ink-4">boxes[{index}]</span>
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBoxes((prev) => prev.filter((item) => item.id !== box.id));
                          setDirty(true);
                        }}
                        className="text-caption text-ink-4 hover:text-danger-fg"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <NumberField
                      label="x"
                      value={box.x}
                      disabled={!editable}
                      onChange={(value) => {
                        setBoxes((prev) =>
                          prev.map((item) => (item.id === box.id ? { ...item, x: value } : item)),
                        );
                        setDirty(true);
                      }}
                    />
                    <NumberField
                      label="y"
                      value={box.y}
                      disabled={!editable}
                      onChange={(value) => {
                        setBoxes((prev) =>
                          prev.map((item) =>
                            item.id === box.id ? { ...item, y: value } : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <NumberField
                      label="w"
                      value={box.w}
                      disabled={!editable}
                      onChange={(value) => {
                        setBoxes((prev) =>
                          prev.map((item) =>
                            item.id === box.id ? { ...item, w: value } : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <NumberField
                      label="h"
                      value={box.h}
                      disabled={!editable}
                      onChange={(value) => {
                        setBoxes((prev) =>
                          prev.map((item) =>
                            item.id === box.id ? { ...item, h: value } : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    <SelectField
                      label="Class"
                      value={box.class}
                      disabled={!editable}
                      options={(labels.length > 0 ? labels : [box.class]).map((value) => ({
                        value,
                        label: value,
                      }))}
                      onChange={(value) => {
                        setBoxes((prev) =>
                          prev.map((item) =>
                            item.id === box.id ? { ...item, class: value } : item,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {empty ? (
            <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
              <p className="text-title text-ink">
                {task.modality === "video" ? "No segments yet" : "No boxes yet"}
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-3">
                {task.modality === "video"
                  ? "Add the first action segment and place its boundaries against the timecode."
                  : "Drag on the image above to draw the first bounding box."}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="lg:col-span-4">
        <div className="sticky top-32 space-y-5">
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-title text-ink">Validation</h2>
              {issues.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-caption font-medium text-success-fg">
                  <Check className="h-3.5 w-3.5" />
                  Passes preview checks
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-caption font-medium text-danger-fg">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {issues.length} issue{issues.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {issues.length === 0 ? (
              <p className="mt-3 text-body-sm text-ink-3">No issues found by the local check.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`} className="flex gap-2.5">
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-fg"
                    />
                    <span>
                      <code className="font-mono text-[11px] text-ink-4">{issue.path}</code>
                      <span className="mt-0.5 block text-caption text-ink-3">{issue.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-caption text-ink-4">
              <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Preview checks only. The server-side validator is authoritative and
              versioned against the schema.
            </p>
          </div>

          {labels.length > 0 ? (
            <div className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-display text-title text-ink">Allowed labels</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <Badge key={label} tone="neutral">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-display text-title text-ink">Instructions</h2>
            <ul className="mt-3 space-y-2.5 text-body-sm text-ink-3">
              {task.modality === "video" ? (
                <>
                  <li>Label only actions visible in the assigned clip.</li>
                  <li>Each segment needs a start, an end and an action label.</li>
                  <li>A failure outcome must carry a failure reason.</li>
                  <li>Segments must be ordered and must not overlap.</li>
                </>
              ) : (
                <>
                  <li>Draw a tight box around each object of interest.</li>
                  <li>Choose the correct class from the job label list.</li>
                  <li>Boxes must stay inside the image and have positive size.</li>
                </>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            {loadedFrom ? (
              <p className="mb-3 text-caption text-ink-4">
                Loaded from your {loadedFrom === "draft" ? "draft" : "previous submission"}
                {savedAt ? ` · ${savedAt.replace("T", " ").slice(0, 19)} UTC` : ""}.
              </p>
            ) : null}

            {result ? (
              <div className="rounded-lg border border-success-line bg-success-bg p-4">
                <p className="flex items-center gap-2 font-medium text-success-fg">
                  <Check className="h-4 w-4" />
                  Submitted — version {result.version}
                </p>
                <p className="mt-1.5 text-caption text-success-fg">
                  Your submission is immutable and now enters review. Version{" "}
                  {result.version} is the one delivered on acceptance.
                </p>
                <ButtonLink
                  href="/workspace/contributor/submissions"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                >
                  View submissions
                </ButtonLink>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!editable || pending}
                    onClick={() => void saveDraft("manual")}
                  >
                    Save draft
                  </Button>
                  <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
                    Submit for review
                  </Button>
                </div>
                {dirty ? (
                  <p className="mt-3 text-caption text-pending-fg">
                    {autosave === "saving"
                      ? "Saving draft…"
                      : autosave === "error"
                        ? "Unsaved changes — autosave failed. Use “Save draft”."
                        : "Unsaved changes — autosaving shortly."}
                  </p>
                ) : savedAt ? (
                  <p className="mt-3 text-caption text-success-fg">
                    Draft saved {formatDateTime(savedAt)}.
                  </p>
                ) : null}
                {notice ? (
                  <p className="mt-3 text-caption text-success-fg">{notice}</p>
                ) : null}
              </>
            )}

            {error ? (
              <div className="mt-3">
                <ValidationDetails error={error} />
              </div>
            ) : null}

            <InfoNote>
              Reward is set per job and credited when work is accepted. It appears
              in Earnings, not here.
            </InfoNote>
          </div>

          <p className="px-1 text-caption text-ink-4">
            <Link href="/workspace/contributor" className="underline hover:text-ink-2">
              Back to the task queue
            </Link>
          </p>
        </div>
      </aside>
    </div>
  );
}

function ImageCanvas({
  src,
  boxes,
  natural,
  editable,
  onResizeImage,
  onAddBox,
  onUpdateBox,
  activeClassControl,
}: {
  src: string;
  boxes: DraftBox[];
  natural: Bounds | null;
  editable: boolean;
  onResizeImage: (bounds: Bounds) => void;
  onAddBox: (box: Box) => void;
  onUpdateBox: (id: string, box: Box) => void;
  activeClassControl: React.ReactNode;
}) {
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const gesture = useRef<
    | { kind: "draw"; startX: number; startY: number }
    | { kind: "move"; id: string; startX: number; startY: number; startBox: Box }
    | {
        kind: "resize";
        id: string;
        handle: ResizeHandle;
        startX: number;
        startY: number;
        startBox: Box;
      }
    | null
  >(null);
  const display = useRef<Bounds>({ w: 0, h: 0 });

  const rectOf = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  };

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">{activeClassControl}</div>
      <div
        role="group"
        aria-label={
          editable
            ? "Annotation canvas. Drag to draw a box, drag a box to move it, or drag a corner to resize it. Use the numeric fields below for keyboard entry."
            : "Annotation canvas (read-only)."
        }
        className={cn(
          "relative w-full overflow-hidden rounded-lg border border-line bg-night select-none",
          editable ? "cursor-crosshair" : "cursor-default",
        )}
        onPointerDown={(event) => {
          if (!editable || !natural) return;
          const point = rectOf(event);
          display.current = { w: point.w, h: point.h };
          const scale = naturalScale({ w: point.w, h: point.h }, natural);
          const index = hitTestBoxes(boxes, point.x * scale.x, point.y * scale.y);
          event.currentTarget.setPointerCapture(event.pointerId);
          if (index >= 0) {
            const box = boxes[index];
            if (!box) return;
            const startBox: Box = { x: box.x, y: box.y, w: box.w, h: box.h };
            const handle = cornerAt({ x: point.x * scale.x, y: point.y * scale.y }, startBox, 10 * scale.x);
            gesture.current = handle
              ? { kind: "resize", id: box.id, handle, startX: point.x, startY: point.y, startBox }
              : { kind: "move", id: box.id, startX: point.x, startY: point.y, startBox };
            return;
          }
          gesture.current = { kind: "draw", startX: point.x, startY: point.y };
          setDrawing({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
        }}
        onPointerMove={(event) => {
          const active = gesture.current;
          if (!active || !natural) return;
          const point = rectOf(event);
          if (active.kind === "draw") {
            setDrawing((prev) => (prev ? { ...prev, x1: point.x, y1: point.y } : prev));
            return;
          }
          const scale = naturalScale(display.current, natural);
          const dx = (point.x - active.startX) * scale.x;
          const dy = (point.y - active.startY) * scale.y;
          onUpdateBox(
            active.id,
            active.kind === "move"
              ? moveBox(active.startBox, dx, dy, natural)
              : resizeBox(active.startBox, active.handle, dx, dy, natural),
          );
        }}
        onPointerUp={(event) => {
          const active = gesture.current;
          gesture.current = null;
          if (!active || !natural) {
            setDrawing(null);
            return;
          }
          if (active.kind !== "draw") return;
          const point = rectOf(event);
          const scale = naturalScale(display.current, natural);
          const width = Math.abs(point.x - active.startX) * scale.x;
          const height = Math.abs(point.y - active.startY) * scale.y;
          if (width >= 1 && height >= 1) {
            onAddBox(
              clampBox(
                {
                  x: Math.min(active.startX, point.x) * scale.x,
                  y: Math.min(active.startY, point.y) * scale.y,
                  w: width,
                  h: height,
                },
                natural,
              ),
            );
          }
          setDrawing(null);
        }}
        onPointerCancel={() => {
          gesture.current = null;
          setDrawing(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Task media"
          className="pointer-events-none block h-auto w-full"
          onLoad={(event) =>
            onResizeImage({
              w: event.currentTarget.naturalWidth,
              h: event.currentTarget.naturalHeight,
            })
          }
        />
        {natural
          ? boxes.map((box) => (
              <div
                key={box.id}
                className="pointer-events-none absolute rounded-sm border-2 border-accent-400 bg-accent-500/15"
                style={{
                  left: pct(box.x, natural.w),
                  top: pct(box.y, natural.h),
                  width: pct(box.w, natural.w),
                  height: pct(box.h, natural.h),
                }}
              >
                <span className="absolute -top-5 left-0 rounded-sm bg-night/80 px-1 font-mono text-[10px] text-white">
                  {box.class}
                </span>
              </div>
            ))
          : null}
        {drawing ? (
          <div
            className="pointer-events-none absolute rounded-sm border-2 border-dashed border-accent-400 bg-accent-500/10"
            style={{
              left: Math.min(drawing.x0, drawing.x1),
              top: Math.min(drawing.y0, drawing.y1),
              width: Math.abs(drawing.x1 - drawing.x0),
              height: Math.abs(drawing.y1 - drawing.y0),
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Seek/scrub track for video tasks. Segments are drawn as bars; the playhead
 * follows the video. Boundaries are only ever set from the *current* playhead,
 * so a contributor marks the frame they can actually see.
 */
function Timeline({
  segments,
  durationMs,
  positionMs,
  selectedId,
  editable,
  onSelect,
  onSeek,
  onSetBoundary,
}: {
  segments: DraftSegment[];
  durationMs: number;
  positionMs: number;
  selectedId: string | null;
  editable: boolean;
  onSelect: (id: string) => void;
  onSeek: (ms: number) => void;
  onSetBoundary: (edge: "start" | "end") => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ready = durationMs > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!editable || !ready}
            onClick={() => onSetBoundary("start")}
          >
            Set start
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!editable || !ready}
            onClick={() => onSetBoundary("end")}
          >
            Set end
          </Button>
          <span className="text-caption text-ink-4">
            at <span className="font-mono">{formatTimecode(positionMs)}</span>
          </span>
        </div>
        <span className="font-mono text-[12px] text-ink-4">
          {formatTimecode(positionMs)} / {formatTimecode(durationMs)}
        </span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Video timeline"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, durationMs)}
        aria-valuenow={Math.round(positionMs)}
        aria-valuetext={formatTimecode(positionMs)}
        tabIndex={0}
        onClick={(event) => {
          if (!ready || !trackRef.current) return;
          const rect = trackRef.current.getBoundingClientRect();
          onSeek(fractionToMs((event.clientX - rect.left) / rect.width, durationMs));
        }}
        onKeyDown={(event) => {
          if (!ready) return;
          if (event.key === "ArrowRight") onSeek(Math.min(durationMs, positionMs + 500));
          if (event.key === "ArrowLeft") onSeek(Math.max(0, positionMs - 500));
        }}
        className={cn(
          "relative mt-2 h-10 w-full overflow-hidden rounded-md border border-line bg-surface",
          ready ? "cursor-pointer" : "cursor-default opacity-60",
        )}
      >
        {segments.map((segment) => {
          const { leftPct, widthPct } = segmentBar(segment, durationMs);
          const active = segment.id === selectedId;
          return (
            <button
              key={segment.id}
              type="button"
              aria-label={`Select segment ${segment.action_label}`}
              onClick={() => onSelect(segment.id)}
              className={cn(
                "absolute top-1.5 bottom-1.5 rounded-sm border-2",
                active
                  ? "border-accent-600 bg-accent-500/30"
                  : "border-accent-400 bg-accent-500/15",
              )}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
          );
        })}
        {ready ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent-600"
            style={{ left: `${timeFraction(positionMs, durationMs) * 100}%` }}
          />
        ) : null}
      </div>
      <p className="mt-2 text-caption text-ink-4">
        {segments.length === 0
          ? "Add a segment, then scrub and use Set start / Set end to place its boundaries."
          : "Scrub the video or click the track, then set the selected segment's boundaries."}
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption text-ink-3">{label}</span>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 rounded-md border border-line-strong bg-surface px-2.5 font-mono text-[13px] text-ink focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:bg-surface-muted disabled:text-ink-4"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption text-ink-3">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] capitalize text-ink focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:bg-surface-muted disabled:text-ink-4"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption text-ink-3">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-4 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:bg-surface-muted disabled:text-ink-4"
      />
    </label>
  );
}
