/**
 * Export data loading.
 *
 * Only tasks in the `accepted` or `paid` states are exported (PRD §14:
 * "Export accepted records only"). For each task the highest-version submission
 * is used, and the accepting review supplies the per-record `reviewer_type`.
 * No contributor identity data is ever loaded.
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import { SCHEMA_BY_MODALITY, type ExportRecord } from "@/lib/export/exporter";
import type {
  ActionSegmentsPayload,
  ImageBoxesPayload,
  Job,
  Modality,
  ReviewerType,
} from "@/src/types/api";

type Row = Record<string, unknown>;

export interface AcceptedExportData {
  job: Job;
  rightsReference: string | null;
  records: ExportRecord[];
  schemaVersion: string;
}

async function selectRows(
  table: string,
  columns: string,
  column: string,
  values: string[],
  filter?: { column: string; value: string },
): Promise<Row[]> {
  if (values.length === 0) return [];
  const supabase = getSupabase();
  let query = supabase.from(table).select(columns).in(column, values);
  if (filter) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw HttpError.internal(`Failed to load ${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

export async function loadAcceptedExportData(job: Job): Promise<AcceptedExportData> {
  const supabase = getSupabase();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("data_rights")
    .eq("id", job.project_id)
    .maybeSingle();
  if (projectError) {
    throw HttpError.internal(`Failed to load project: ${projectError.message}`);
  }
  const rightsReference = (project?.data_rights as string | null) ?? null;

  const { data: taskRows, error: taskError } = await supabase
    .from("tasks")
    .select("id, asset_id, modality")
    .eq("job_id", job.id)
    .in("status", ["accepted", "paid"]);
  if (taskError) {
    throw HttpError.internal(`Failed to load accepted tasks: ${taskError.message}`);
  }

  const tasks = (taskRows ?? []) as Row[];
  if (tasks.length === 0) {
    return {
      job,
      rightsReference,
      records: [],
      schemaVersion: SCHEMA_BY_MODALITY[job.modality],
    };
  }

  const taskIds = tasks.map((task) => task.id as string);
  const assetIds = Array.from(new Set(tasks.map((task) => task.asset_id as string)));

  const assetRows = await selectRows(
    "assets",
    "id, content_hash, width, height",
    "id",
    assetIds,
  );
  const assetMap = new Map<string, Row>(assetRows.map((a) => [a.id as string, a]));

  const submissionRows = await selectRows(
    "submissions",
    "id, task_id, payload, payload_hash, schema_version, submitted_at, version",
    "task_id",
    taskIds,
  );
  const submissionByTask = new Map<string, Row>();
  for (const submission of submissionRows) {
    const taskId = submission.task_id as string;
    const existing = submissionByTask.get(taskId);
    if (!existing || Number(submission.version) > Number(existing.version)) {
      submissionByTask.set(taskId, submission);
    }
  }
  const submissionIds = Array.from(submissionByTask.values()).map(
    (submission) => submission.id as string,
  );

  const reviewerBySubmission = new Map<string, ReviewerType>();
  const reviewRows = await selectRows(
    "reviews",
    "submission_id, reviewer_type, created_at",
    "submission_id",
    submissionIds,
    { column: "decision", value: "accept" },
  );
  for (const review of reviewRows) {
    reviewerBySubmission.set(
      review.submission_id as string,
      review.reviewer_type as ReviewerType,
    );
  }

  const txBySubmission = new Map<string, string | null>();
  const receiptRows = await selectRows(
    "receipts",
    "submission_id, tx_hash",
    "submission_id",
    submissionIds,
  );
  for (const receipt of receiptRows) {
    txBySubmission.set(
      receipt.submission_id as string,
      (receipt.tx_hash as string | null) ?? null,
    );
  }

  const records: ExportRecord[] = [];
  for (const task of tasks) {
    const submission = submissionByTask.get(task.id as string);
    if (!submission) continue;
    const asset = assetMap.get(task.asset_id as string);
    const modality = task.modality as Modality;
    records.push({
      task_id: task.id as string,
      asset_id: task.asset_id as string,
      modality,
      asset_hash: (asset?.content_hash as string) ?? "",
      schema_version:
        (submission.schema_version as string) ?? SCHEMA_BY_MODALITY[modality],
      payload_hash: submission.payload_hash as string,
      reviewer_type: reviewerBySubmission.get(submission.id as string) ?? "code",
      submitted_at: submission.submitted_at as string,
      receipt_tx_hash: txBySubmission.get(submission.id as string) ?? null,
      width: (asset?.width as number | null) ?? null,
      height: (asset?.height as number | null) ?? null,
      payload: submission.payload as ImageBoxesPayload | ActionSegmentsPayload,
    });
  }

  const schemaVersion =
    records[0]?.schema_version ?? SCHEMA_BY_MODALITY[job.modality];
  return { job, rightsReference, records, schemaVersion };
}