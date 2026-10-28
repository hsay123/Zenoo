"use client";

import { useState } from "react";
import { useAction, useAppealsQueue } from "@/lib/api/live";
import { QueryView, InlineError, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader, Stat } from "@/components/product/WorkspaceHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Scale } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/utils/format";
import { appealSchema, platformPaths, type Appeal, type AppealQueueItem } from "@/lib/api/platform";

/**
 * Disputes and appeals.
 *
 * Reads the real appeals queue. Each appeal is re-reviewed independently; the
 * adjudicator upholds or dismisses it, and the outcome is recorded with a reason
 * code. The queue carries the original submission, task and job for context.
 */
export function ReviewerDisputes() {
  const appeals = useAppealsQueue();
  // The queue only exposes open appeals, so a decided appeal leaves the list.
  // Keep the outcomes recorded in this visit visible so the adjudicator still
  // sees what they just did.
  const [decided, setDecided] = useState<Appeal[]>([]);

  return (
    <>
      <WorkspaceHeader
        eyebrow="Reviewer"
        title="Disputes and appeals"
        description="Appeals are re-reviewed independently, with the original submission attached. An adjudicator upholds or dismisses the appeal, and the outcome is recorded."
      />

      <QueryView query={appeals}>
        {(items) => {
          const open = items.filter((item) => item.status === "open");

          return (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Stat label="Open appeals" value={String(open.length)} hint="Awaiting adjudication" />
                <Stat
                  label="Resolved this session"
                  value={String(decided.length)}
                  hint="By you, in this visit"
                  tone="muted"
                />
              </div>

              {decided.length > 0 ? (
                <div className="mt-6 rounded-xl border border-success-line bg-success-bg p-5">
                  <p className="font-medium text-success-fg">Appeal adjudicated</p>
                  <ul className="mt-1.5 space-y-1 text-body-sm text-success-fg">
                    {decided.map((appeal) => (
                      <li key={appeal.id}>
                        appeal {appeal.id.slice(0, 8)}… → {appeal.status}
                        {appeal.resolution_notes ? ` (${appeal.resolution_notes})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {items.length === 0 ? (
                <div className="mt-6">
                  <EmptyState
                    icon={Scale}
                    title="No appeals"
                    description="There are no appeals awaiting adjudication. This reflects the live queue."
                  />
                </div>
              ) : (
                <ul className="mt-6 space-y-4">
                  {items.map((item) => (
                    <AppealCard
                      key={item.id}
                      appeal={item}
                      onDecided={(appeal) => {
                        setDecided((prev) => [appeal, ...prev]);
                        appeals.reload();
                      }}
                    />
                  ))}
                </ul>
              )}

              <InfoNote>
                Upholding an appeal reverses the original decision; dismissing it
                leaves the decision in place. Either way, the original submission
                and its review remain immutable in the record.
              </InfoNote>
            </>
          );
        }}
      </QueryView>
    </>
  );
}

function AppealCard({
  appeal,
  onDecided,
}: {
  appeal: AppealQueueItem;
  onDecided: (appeal: Appeal) => void;
}) {
  const { run, pending, error } = useAction();
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<Appeal | null>(null);

  const decide = async (outcome: "uphold" | "dismiss") => {
    const updated = await run((client) =>
      client.post(appealSchema, platformPaths.appealDecision(appeal.id), {
        body: {
          decision: outcome === "uphold" ? "accept" : "reject",
          reason_code: outcome === "uphold" ? "APPEAL_UPHELD" : "APPEAL_DISMISSED",
          notes: notes.trim() || undefined,
        },
        idempotencyKey: `appeal-decision:${appeal.id}:${outcome}`,
      }),
    );
    if (updated) {
      setResult(updated);
      onDecided(updated);
    }
  };

  const decided = appeal.status !== "open";

  return (
    <li className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusChip status={appeal.status} />
          <span className="text-caption text-ink-4">
            appeal {appeal.id.slice(0, 8)}… · submission v{appeal.submission.version}
          </span>
        </div>
        <Badge tone="neutral">{appeal.job.title}</Badge>
      </div>

      <p className="mt-3 text-body-sm text-ink-2">{appeal.reason}</p>

      <dl className="mt-3 grid gap-3 text-caption text-ink-4 sm:grid-cols-3">
        <div>
          <dt className="uppercase tracking-[0.06em]">Modality</dt>
          <dd className="mt-0.5 capitalize text-ink-3">{appeal.task.modality}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.06em]">Task version</dt>
          <dd className="mt-0.5 font-mono text-ink-3">v{appeal.submission.version}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.06em]">Filed</dt>
          <dd className="mt-0.5 text-ink-3">{formatDateTime(appeal.created_at)}</dd>
        </div>
      </dl>

      {appeal.resolution_notes ? (
        <p className="mt-3 rounded-md border border-line bg-canvas p-3 text-caption text-ink-3">
          Resolution: {appeal.resolution_notes}
        </p>
      ) : null}

      {result ? (
        <p className="mt-3 text-caption text-success-fg">
          Recorded: {result.status} ({result.resolution_notes ?? "no notes"}).
        </p>
      ) : decided ? (
        <p className="mt-3 text-caption text-ink-4">This appeal is already decided.</p>
      ) : (
        <div className="mt-4 border-t border-line pt-4">
          <TextAreaField
            id={`appeal-notes-${appeal.id}`}
            label="Adjudication notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Record the basis for the outcome."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void decide("uphold")}
              disabled={pending}
            >
              Uphold appeal
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void decide("dismiss")}
              disabled={pending}
            >
              Dismiss appeal
            </Button>
          </div>
          {error ? (
            <div className="mt-3">
              <InlineError error={error} />
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}
