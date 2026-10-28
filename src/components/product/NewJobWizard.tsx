"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Check, Info } from "@/components/ui/icons";
import { InlineError } from "@/components/product/AsyncView";
import { JobFunding } from "@/components/product/JobFunding";
import { useSession } from "@/lib/api/session";
import { useProjects } from "@/lib/api/live";
import { appChain } from "@/lib/privy/config";
import {
  PlatformError,
  SCHEMA_VERSIONS,
  jobSchema,
  platformPaths,
  projectSchema,
  taskSchema,
  type Job,
} from "@/lib/api/platform";
import { uploadAsset } from "@/lib/media/upload";
import { cn } from "@/lib/utils/cn";
import { z } from "zod";

const steps = [
  { id: "project", label: "Project" },
  { id: "media", label: "Media" },
  { id: "schema", label: "Schema" },
  { id: "budget", label: "Budget" },
  { id: "review", label: "Review" },
] as const;

type Modality = "image" | "video";

/**
 * Amount unit is **USDC** (6 decimals) on Base — the same number is used for
 * the buyer's budget/reward and the on-chain payout. We validate the exact
 * decimal shape (≤ 12 integer digits, ≤ 6 decimals, positive) without ever
 * coercing through `Number()`, which loses precision and would silently
 * disagree with the USDC base units settled on-chain. (`Mon` in the helper
 * names is historical.)
 */
const MON_AMOUNT_RE = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const ZERO_AMOUNT_RE = /^0(?:\.0+)?$/;
function isValidMonAmount(value: string): boolean {
  const trimmed = value.trim();
  return MON_AMOUNT_RE.test(trimmed) && !ZERO_AMOUNT_RE.test(trimmed);
}

type Values = {
  projectId: string;
  projectName: string;
  dataRights: string;
  retention: string;
  title: string;
  description: string;
  modality: Modality;
  labels: string;
  policy: string;
  budget: string;
  reward: string;
  deadline: string;
};

type Progress = { label: string; status: "running" | "done" | "error" };

const defaultLabels = (modality: Modality) =>
  (modality === "image" ? SCHEMA_VERSIONS.image.labels : SCHEMA_VERSIONS.video.labels).join(
    ", ",
  );

const initialValues: Values = {
  projectId: "",
  projectName: "",
  dataRights: "",
  retention: "",
  title: "",
  description: "",
  modality: "video",
  labels: defaultLabels("video"),
  policy: "",
  budget: "",
  reward: "",
  deadline: "",
};

const modalitySchemaFor = (modality: Modality) =>
  modality === "image" ? SCHEMA_VERSIONS.image : SCHEMA_VERSIONS.video;

const parseLabels = (raw: string) =>
  raw
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

/**
 * Job creation wizard — the real S2 flow.
 *
 * Creates a project (or reuses one), uploads the selected media to object
 * storage, registers each asset with its content hash and dimensions, creates
 * the draft job, generates one task per asset, then publishes the job so the
 * tasks become claimable. Every step is a real API call; failures are shown,
 * never swallowed. Gold tasks are admin-only and are not offered to buyers.
 */
export function NewJobWizard() {
  const { client } = useSession();
  const projectsQuery = useProjects();

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(initialValues);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState<PlatformError | null>(null);
  const [createdJob, setCreatedJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);

  const set =
    (key: keyof Values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const setModality = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const modality = event.target.value as Modality;
    setValues((prev) => ({
      ...prev,
      modality,
      labels: prev.labels === defaultLabels(prev.modality) ? defaultLabels(modality) : prev.labels,
    }));
  };

  const labelList = useMemo(() => parseLabels(values.labels), [values.labels]);

  const canAdvance = () => {
    if (step === 0) {
      if (!values.projectId && values.projectName.trim().length < 2) return false;
      return values.title.trim().length > 0;
    }
    if (step === 1) return files.length > 0;
    if (step === 2) return labelList.length > 0;
    if (step === 3) return isValidMonAmount(values.budget) && isValidMonAmount(values.reward);
    return true;
  };

  const pushProgress = (label: string) =>
    setProgress((prev) => [...prev, { label, status: "running" }]);
  const settleProgress = (status: "done" | "error") =>
    setProgress((prev) =>
      prev.map((item, index) =>
        index === prev.length - 1 ? { ...item, status } : item,
      ),
    );

  async function submit() {
    setRunning(true);
    setError(null);
    setProgress([]);
    try {
      let projectId = values.projectId;
      if (!projectId) {
        pushProgress(`Create project “${values.projectName.trim()}”`);
        const project = await client.post(projectSchema, platformPaths.projects(), {
          body: {
            name: values.projectName.trim(),
            data_rights: values.dataRights.trim() || undefined,
            retention_policy: values.retention.trim() || undefined,
          },
        });
        projectId = project.id;
        settleProgress("done");
      }

      const assetIds: string[] = [];
      for (const file of files) {
        pushProgress(`Upload ${file.name}`);
        const { asset } = await uploadAsset(client, {
          projectId,
          modality: values.modality,
          file,
        });
        assetIds.push(asset.id);
        settleProgress("done");
      }

      const schema = modalitySchemaFor(values.modality);
      pushProgress(`Create job “${values.title.trim()}”`);
      const job = await client.post(jobSchema, platformPaths.jobs(), {
        body: {
          project_id: projectId,
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          modality: values.modality,
          reward_per_task: values.reward.trim(),
          budget: values.budget.trim(),
          deadline: values.deadline
            ? new Date(`${values.deadline}T23:59:59Z`).toISOString()
            : undefined,
          rubric: values.policy.trim()
            ? { acceptance_policy: values.policy.trim() }
            : undefined,
          label_list: labelList,
          schema_version_id: schema.id,
        },
      });
      settleProgress("done");

      pushProgress(`Generate ${assetIds.length} task(s)`);
      await client.post(z.array(taskSchema), platformPaths.jobTasks(job.id), {
        body: { asset_ids: assetIds },
        idempotencyKey: `tasks:${job.id}`,
      });
      settleProgress("done");

      pushProgress("Publish job");
      const published = await client.post(jobSchema, platformPaths.publishJob(job.id), {
        idempotencyKey: `publish:${job.id}`,
      });
      settleProgress("done");

      setCreatedJob(published);
    } catch (cause) {
      settleProgress("error");
      setError(cause instanceof PlatformError ? cause : new PlatformError("SERVER", "Something went wrong."));
    } finally {
      setRunning(false);
    }
  }

  if (createdJob) {
    return (
      <>
      <div className="rounded-xl border border-success-line bg-success-bg p-6">
        <div className="flex items-start gap-3">
          <Check aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
          <div>
            <h2 className="font-display text-title text-success-fg">Job published</h2>
            <p className="mt-2 max-w-xl text-body-sm text-success-fg">
              “{createdJob.title}” is live. {files.length} task
              {files.length === 1 ? "" : "s"} become claimable by contributors once
              the job is funded below.
            </p>
            <p className="mt-3 font-mono text-caption text-success-fg/80">
              {createdJob.id}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <ButtonLink href={`/workspace/buyer/jobs/${createdJob.id}`}>
                Open job
              </ButtonLink>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreatedJob(null);
                  setValues(initialValues);
                  setFiles([]);
                  setProgress([]);
                  setStep(0);
                }}
              >
                Create another
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Fund step: the job must be funded before its tasks are claimable. */}
      <JobFunding jobId={createdJob.id} jobStatus={createdJob.status} />
      </>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
      {/* Stepper */}
      <nav aria-label="Steps" className="min-w-0 lg:col-span-3">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {steps.map((item, index) => {
            const active = index === step;
            const done = index < step;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => index <= step && !running && setStep(index)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-left text-body-sm transition-colors",
                    active
                      ? "bg-accent-50 text-accent-800"
                      : done
                        ? "text-ink-2 hover:bg-surface-muted"
                        : "text-ink-4",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                      active
                        ? "border-accent-500 bg-accent-600 text-white"
                        : done
                          ? "border-success-line bg-success-bg text-success-fg"
                          : "border-line-strong",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 lg:col-span-7">
        <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
          {step === 0 ? (
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-title text-ink">Project and job</h2>
              <SelectField
                id="projectId"
                label="Project"
                value={values.projectId}
                onChange={set("projectId")}
                hint="A job belongs to a project. Reuse one, or create a new project."
              >
                <option value="">Create a new project…</option>
                {(projectsQuery.status === "ready" ? projectsQuery.data : []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectField>

              {values.projectId === "" ? (
                <>
                  <TextField
                    id="projectName"
                    label="Project name"
                    required
                    value={values.projectName}
                    onChange={set("projectName")}
                    placeholder="Robotics manipulation — Q4 intake"
                  />
                  <TextAreaField
                    id="dataRights"
                    label="Data rights"
                    value={values.dataRights}
                    onChange={set("dataRights")}
                    placeholder="Describe the source of the data, who holds the rights, and any restrictions on its use."
                  />
                  <TextField
                    id="retention"
                    label="Retention policy"
                    value={values.retention}
                    onChange={set("retention")}
                    placeholder="e.g. Delete source media 90 days after export"
                  />
                </>
              ) : (
                <p className="text-caption text-ink-3">
                  Using an existing project. Its data-rights declaration is already recorded.
                </p>
              )}

              <TextField
                id="title"
                label="Job title"
                required
                value={values.title}
                onChange={set("title")}
                placeholder="Pick-and-place failure clips"
              />
              <TextAreaField
                id="description"
                label="Description"
                rows={3}
                value={values.description}
                onChange={set("description")}
                placeholder="What should contributors annotate, and what counts as an acceptable label?"
              />
              <SelectField
                id="modality"
                label="Modality"
                value={values.modality}
                onChange={setModality}
                hint="The modality decides the annotation schema and the media accepted."
              >
                <option value="video">Video — action segments</option>
                <option value="image">Image — bounding boxes</option>
              </SelectField>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-title text-ink">Media</h2>
              <div className="flex items-start gap-2.5 rounded-lg border border-info-line bg-info-bg p-4">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-fg" />
                <p className="text-caption text-info-fg">
                  Files are uploaded to object storage when you publish, and each
                  becomes one task. {values.modality === "video" ? "Video" : "Image"}{" "}
                  files only.
                </p>
              </div>
              <input
                type="file"
                multiple
                accept={values.modality === "image" ? "image/*" : "video/*"}
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  setFiles((prev) => [...prev, ...picked]);
                  event.target.value = "";
                }}
                className="block w-full cursor-pointer rounded-md border border-dashed border-line-strong bg-canvas px-4 py-6 text-body-sm text-ink-3 file:mr-4 file:rounded-md file:border-0 file:bg-surface file:px-3.5 file:py-2 file:text-body-sm file:font-medium file:text-ink hover:border-ink-4"
              />
              {files.length > 0 ? (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="min-w-0 truncate text-body-sm text-ink">
                        {file.name}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-caption text-ink-4">
                          {(file.size / 1_048_576).toFixed(1)} MB
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setFiles((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          Remove
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-ink-4">
                  No files selected yet. At least one file is required.
                </p>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-title text-ink">Schema and rubric</h2>
              <div className="rounded-lg border border-line bg-canvas p-4">
                <p className="text-caption text-ink-3">
                  <span className="font-medium text-ink">Schema:</span>{" "}
                  {modalitySchemaFor(values.modality).name}
                </p>
                <p className="mt-2 text-caption text-ink-3">
                  Contributors annotate with this schema; it is fixed per modality.
                </p>
              </div>
              <TextField
                id="labels"
                label="Label list"
                required
                value={values.labels}
                onChange={set("labels")}
                hint="Comma-separated. Class labels contributors may use."
              />
              <TextAreaField
                id="policy"
                label="Acceptance policy"
                value={values.policy}
                onChange={set("policy")}
                placeholder="State the acceptance criteria, the sampling policy and the remediation window."
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-title text-ink">Budget and deadline</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  id="budget"
                  type="number"
                  inputMode="decimal"
                  step="0.000001"
                  label="Budget (testnet USDC)"
                  required
                  value={values.budget}
                  onChange={set("budget")}
                  placeholder="4800"
                />
                <TextField
                  id="reward"
                  type="number"
                  inputMode="decimal"
                  step="0.000001"
                  label="Reward per task (testnet USDC)"
                  required
                  value={values.reward}
                  onChange={set("reward")}
                  placeholder="12"
                />
              </div>
              <TextField
                id="deadline"
                type="date"
                label="Deadline"
                value={values.deadline}
                onChange={set("deadline")}
              />
              <div className="flex items-start gap-2.5 rounded-lg border border-info-line bg-info-bg p-4">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-fg" />
                <p className="text-caption text-info-fg">
                  Budget and reward are denominated in <strong>testnet USDC</strong>, the
                  same unit settled on {appChain.name}. Testnet USDC is a test currency
                  with no real-world value. Payouts are only made for work that passes
                  review.
                </p>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-title text-ink">Review and publish</h2>
              <dl className="divide-y divide-line rounded-lg border border-line">
                {[
                  ["Project", values.projectId ? "Existing project" : values.projectName.trim()],
                  ["Job title", values.title.trim()],
                  ["Modality", values.modality],
                  ["Schema", modalitySchemaFor(values.modality).name],
                  ["Files", `${files.length}`],
                  ["Budget", `${values.budget} USDC`],
                  ["Reward / task", `${values.reward} USDC`],
                  ["Deadline", values.deadline || "—"],
                  ["Labels", labelList.join(", ")],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <dt className="text-body-sm text-ink-3">{label}</dt>
                    <dd className="max-w-[60%] truncate text-right text-body-sm font-medium text-ink">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">Draft → published</Badge>
                <span className="text-caption text-ink-4">
                  Gold tasks are created by an admin and are not available here.
                </span>
              </div>
              {error ? <InlineError error={error} /> : null}
              {progress.length > 0 ? (
                <ol className="space-y-1.5 rounded-lg border border-line bg-canvas p-4">
                  {progress.map((item, index) => (
                    <li
                      key={`${item.label}-${index}`}
                      className="flex items-center gap-2 text-caption text-ink-3"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 rounded-full",
                          item.status === "done"
                            ? "bg-success-fg"
                            : item.status === "error"
                              ? "bg-danger-fg"
                              : "animate-pulse bg-pending-fg",
                        )}
                      />
                      {item.label}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || running}
            >
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance() || running}
              >
                Continue
              </Button>
            ) : (
              <Button type="button" onClick={() => void submit()} disabled={running}>
                {running ? "Publishing…" : "Create and publish job"}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-4 text-caption text-ink-4">
          Need the API? See{" "}
          <Link href="/workspace/buyer" className="underline hover:text-ink-2">
            your dashboard
          </Link>{" "}
          for existing jobs.
        </p>
      </div>
    </div>
  );
}
