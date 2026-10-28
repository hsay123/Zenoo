/**
 * Landing-page content.
 *
 * All copy describes capabilities defined in the product specification.
 * Where something is not yet built it is labelled "Planned" rather than
 * implied. There are no invented customers, metrics or certifications.
 */

import { media } from "@/lib/media/assets";

export const hero = {
  eyebrow: "Data operations for machine learning",
  headline: "Build better models with data you can trust.",
  support:
    "Zeno turns rights-cleared images and video into structured, reviewed annotation and training-ready datasets — with a traceable path from source media to accepted delivery.",
  primary: { label: "Get started", href: "/signup" },
  secondary: { label: "Explore the platform", href: "/explore" },
} as const;

/**
 * The credibility strip.
 *
 * Deliberately carries workflow categories rather than customer logos:
 * no partner or customer relationship has been verified, so none is
 * implied. Swap in approved logos when they exist.
 */
export const credibilityCategories = [
  { label: "Image annotation", detail: "Regions and objects on still images" },
  { label: "Video annotation", detail: "Timestamped action segments" },
  { label: "Data quality", detail: "Schema checks and gold tasks" },
  { label: "Provenance", detail: "Versioned records and manifests" },
] as const;

export const capabilityIntro = {
  eyebrow: "The workflow",
  heading: "From raw images and video <br class=\"hidden md:block\" /> to training-ready datasets.",
  support:
    "One connected workflow for collecting, labelling, reviewing and delivering high-quality data. Every accepted label keeps the schema version, review decision and receipt behind it.",
} as const;

export type Capability = {
  id: string;
  index: string;
  eyebrow: string;
  heading: string;
  body: string;
  bullets: string[];
  asset: (typeof media)[keyof typeof media];
  placeholderLabel: string;
  /** Composition varies per section so the page never repeats one layout. */
  layout: "media-left" | "media-right" | "stacked";
};

export const capabilities: Capability[] = [
  {
    id: "annotate",
    index: "01",
    eyebrow: "Annotate and structure",
    heading: "Turn images and video into structured labels.",
    body: "Contributors work inside a focused browser workspace. They draw regions on a still image, or scrub the assigned video segment and place action boundaries against a timecode, then fill in the fields your schema defines — with the instructions and worked examples beside them the whole time.",
    bullets: [
      "Image region and video action annotation",
      "Object boxes, or action labels with explicit start and end timestamps",
      "A task-specific schema you define per project",
      "Contributor instructions and worked examples in context",
      "Versioned submissions — corrections never overwrite history",
    ],
    asset: media.annotationWorkspace,
    placeholderLabel: "[Replace with annotation interface screenshot]",
    layout: "media-right",
  },
  {
    id: "review",
    index: "02",
    eyebrow: "Review and validate",
    heading: "Independent review against a rubric you define.",
    body: "Nothing is accepted on trust. A server-side validator checks schema, timestamp bounds and segment ordering first. Then a reviewer — who cannot review their own work — compares the submission against the source media and the rubric, and records a reason-coded decision.",
    bullets: [
      "Rubric-based evaluation with published reason codes",
      "Accept, request correction, or reject with a stated reason",
      "Full review history: reviewer, decision, notes, rubric version",
      "Quality reports with acceptance and correction counts",
      "Accepted-version tracking, so a delivery is reproducible",
    ],
    asset: media.reviewWorkspace,
    placeholderLabel: "[Replace with annotation review interface screenshot]",
    layout: "media-left",
  },
  {
    id: "deliver",
    index: "03",
    eyebrow: "Deliver and verify",
    heading: "Accepted work becomes a dataset you can trace.",
    body: "An export is generated from a frozen set of accepted versions — never a silent overwrite. You receive the annotation records alongside the schema, a quality report and a provenance manifest that maps the dataset back to the decisions and settlement records behind it.",
    bullets: [
      "JSONL and CSV exports of accepted records only",
      "Schema and version information shipped with the data",
      "Quality report with stated definitions and sample sizes",
      "Provenance manifest: source references, checksums, export version",
      "Settlement status shown where payment records exist",
    ],
    asset: media.datasetExport,
    placeholderLabel: "[Replace with dataset export preview]",
    layout: "stacked",
  },
];

export const workflow = {
  eyebrow: "One workflow",
  heading: "One workflow. From raw media to usable data.",
  support:
    "Each stage hands off a specific, inspectable artifact. Nothing moves forward on assumption — and nothing is paid for until it has been accepted.",
  steps: [
    {
      id: "source",
      label: "Source media",
      detail: "Rights-cleared images or video, uploaded privately and split into scoped units.",
      state: "Private object storage",
    },
    {
      id: "annotate",
      label: "Annotation",
      detail: "Contributors label actions and failures against the project schema.",
      state: "Immutable version",
    },
    {
      id: "review",
      label: "Quality review",
      detail: "Schema validation, then rubric review by someone who did not write it.",
      state: "Reason-coded decision",
    },
    {
      id: "dataset",
      label: "Accepted dataset",
      detail: "A frozen set of accepted versions, bound to the schema that produced them.",
      state: "Versioned set",
    },
    {
      id: "export",
      label: "Export",
      detail: "JSONL or CSV plus schema, quality report and provenance manifest.",
      state: "Signed download",
    },
  ],
} as const;

export const useCases = {
  eyebrow: "Where it fits",
  heading: "Built for teams that train on real-world data.",
  support:
    "The current release supports image and video annotation. Start with the modality that fits your data — audio, text and 3D are not supported yet.",
  items: [
    {
      id: "manipulation",
      title: "Robotics and embodied AI",
      body: "Reach, grasp, lift, place and recover. Capture the failure events that decide whether a policy generalises.",
      asset: media.useCaseManipulation,
      tags: ["Action segments", "Failure events"],
    },
    {
      id: "humanoid",
      title: "Medical and life sciences",
      body: "Regions of interest on scans, slides and imagery, labelled consistently across contributors and reviewers.",
      asset: media.useCaseHumanoid,
      tags: ["Image regions", "Objects"],
    },
    {
      id: "industrial",
      title: "Industrial inspection",
      body: "Defects, workcell actions and handoffs recorded against a stable schema, so quality can be tracked over time.",
      asset: media.useCaseIndustrial,
      tags: ["Defects", "Regions"],
    },
    {
      id: "autonomous",
      title: "Retail, logistics and agriculture",
      body: "Shelves, packages and field imagery labelled with the schema your pipeline consumes, sliceable by scenario.",
      asset: media.useCaseAutonomous,
      tags: ["Detection", "Classification"],
    },
  ],
} as const;

export const productShowcase = {
  eyebrow: "The application",
  heading: "The workspace your team actually operates.",
  support:
    "A buyer workspace that answers three questions at a glance: what is in flight, what is the quality, and what will it cost. Contributor and reviewer surfaces are separate, and built around their own primary job.",
  asset: media.productShowcase,
  points: [
    {
      title: "Buyer workspace",
      body: "Jobs, task states, budget reconciliation, quality signals and export readiness.",
    },
    {
      title: "Annotation workspace",
      body: "Image or video canvas, timeline, schema-driven fields and honest submission state.",
    },
    {
      title: "Review console",
      body: "Source beside submission, rubric, discrepancies and reason-coded decisions.",
    },
  ],
} as const;

export const trust = {
  eyebrow: "Trust model",
  heading: "Quality you can inspect. Data you can trace.",
  support:
    "Trust here is a set of concrete artifacts, not a badge. Each one is something you can open, count or verify.",
  items: [
    {
      id: "versioned",
      title: "Versioned annotations",
      body: "Every submission is an immutable version. A correction creates a new one, so no accepted record is quietly rewritten.",
      icon: "layers",
    },
    {
      id: "decisions",
      title: "Review decisions",
      body: "Each decision carries the reviewer, the reason code, the rubric version and a timestamp — recorded for every outcome.",
      icon: "scale",
    },
    {
      id: "provenance",
      title: "Dataset provenance",
      body: "A manifest maps an export back to the schema, source references and the set of accepted versions it was built from.",
      icon: "receipt",
    },
    {
      id: "private",
      title: "Private source media",
      body: "Source media stays in private storage behind short-lived, task-scoped access. It is never exposed publicly.",
      icon: "lock",
    },
    {
      id: "settlement",
      title: "Settlement records",
      body: "Where a settlement is implemented, the actual transaction state is shown — with the distinction between eligible, pending and confirmed kept explicit.",
      icon: "check",
    },
  ],
} as const;

export const faqs = {
  eyebrow: "Questions",
  heading: "Before you start a pilot.",
  items: [
    {
      q: "What data do you accept today?",
      a: "Right now: images and video. Images are annotated with object regions, and video with timestamped action segments and failure events. Other modalities — audio, text, 3D, depth, LiDAR and synchronised multi-sensor capture — are not supported yet and are not sold as if they were.",
    },
    {
      q: "How is annotation quality controlled?",
      a: "Layered, and each layer is inspectable: server-side schema and timestamp validation, gold tasks with known answers, independent human review by someone who did not write the annotation, and random audits of accepted work. Disagreements escalate to an adjudicator rather than being forced into a false consensus.",
    },
    {
      q: "Does any of this happen on a blockchain?",
      a: "Only selected settlement and provenance events, if a project enables them. Raw video, personal information, detailed labels and reviewer notes stay off-chain. A content hash helps detect change; it does not prove that a label is correct, and we do not claim otherwise.",
    },
    {
      q: "How do contributors get paid?",
      a: "Only accepted work becomes eligible for payment under the project's published policy. Submitted, accepted and paid are three distinct states in the interface, and a rejected submission does not become payable. Failed transactions stay visibly unpaid rather than being retried into a duplicate.",
    },
    {
      q: "How do you measure quality?",
      a: "With defined, stated metrics rather than a single unexplained score: first-pass and final acceptance rates, correction rate by rubric version, reviewer agreement and audit defect rate. Every figure states its definition, sample size and time window — and shows 'not enough data' rather than a number when the sample is too small.",
    },
    {
      q: "What does a pilot look like?",
      a: "One schema, one rights-cleared dataset and a narrow label set, run as a controlled batch. We review quality together, refine the rubric, and only then scale. The goal of a pilot is a measurable answer on cost per accepted record and turnaround — not a demo.",
    },
  ],
} as const;

export const finalCta = {
  heading: "Build your next model on better data.",
  support:
    "Start with your image or video workflow and turn reviewed work into datasets your team can use.",
  primary: { label: "Get started", href: "/signup" },
  secondary: { label: "Explore the platform", href: "/explore" },
} as const;
