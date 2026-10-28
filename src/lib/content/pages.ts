/**
 * Content for the secondary marketing routes.
 *
 * Sourced from the product specification. Where a capability is not yet
 * built it is labelled as planned or explicitly out of scope rather than
 * implied to exist.
 */

import { media } from "@/lib/media/assets";

export const platformPage = {
  eyebrow: "The platform",
  title: "One workflow for quality-assured image and video data.",
  lead: "Zeno covers the full path from rights-cleared source media to an accepted, exportable annotation record — with the schema, the review decision and the receipt kept alongside it. It is a managed-delivery product, not a bare task marketplace.",
  meta: [
    { label: "Schemas", value: "image-boxes-v1, action-segments-v1" },
    { label: "Task unit", value: "Image regions or short video segments" },
    { label: "Export", value: "JSONL, CSV + manifest" },
    { label: "Settlement", value: "Selected events only" },
  ],
  quality: {
    eyebrow: "Quality system",
    heading: "Layered controls, each one inspectable.",
    support:
      "Quality is not a single score. It is a set of controls with defined behaviour, and metrics that state their own definition, sample size and window.",
    items: [
      {
        title: "Schema and timestamp validation",
        body: "A versioned server-side validator checks required fields, label values, timestamp ordering, segment bounds and duplicate records before anything reaches a person.",
        note: "Blocks malformed records",
      },
      {
        title: "Gold tasks",
        body: "Known-answer tasks calibrate contributors and reviewers, and are sampled periodically to detect drift in either group.",
        note: "Calibration",
      },
      {
        title: "Independent human review",
        body: "A reviewer who did not write the annotation compares it against the source media and the rubric. Self-approval is not possible.",
        note: "Semantic correctness",
      },
      {
        title: "Redundant annotation",
        body: "A configured sample of difficult tasks receives a second independent annotation so agreement can be measured rather than assumed.",
        note: "Agreement sampling",
      },
      {
        title: "Random audit",
        body: "Accepted records are re-reviewed on a random basis to catch drift and collusion that targeted review would miss.",
        note: "Drift detection",
      },
      {
        title: "Appeals and adjudication",
        body: "Contributors can appeal a decision. An independent adjudicator re-reviews with evidence and records an outcome, so disagreement is resolved on the record.",
        note: "Procedural fairness",
      },
    ],
    metrics: {
      title: "Metrics with stated definitions",
      body: "First-pass acceptance, final acceptance, correction rate, reviewer gold-task accuracy, inter-annotator agreement and random-audit defect rate. Each figure carries its definition, sample size and time window — and shows “not enough data” rather than an invented value when the sample is too small.",
      sample: [
        {
          key: "first_pass_acceptance",
          label: "First-pass acceptance",
          definition:
            "Accepted without a correction request ÷ submissions reviewed, for the stated window.",
        },
        {
          key: "final_acceptance",
          label: "Final acceptance",
          definition: "Accepted ÷ completed submissions for a defined cohort.",
        },
        {
          key: "correction_rate",
          label: "Correction rate",
          definition:
            "Submissions returned for correction ÷ reviewed, grouped by rubric version.",
        },
        {
          key: "audit_defect_rate",
          label: "Random-audit defect rate",
          definition:
            "Defects found when re-reviewing a random sample of accepted work.",
        },
      ],
    },
  },
  provenance: {
    eyebrow: "Provenance and receipts",
    heading: "Trace an export back to the decisions behind it.",
    support:
      "Each delivered dataset carries a manifest that maps it to the schema that produced it, the accepted versions it was frozen from, and the settlement records where they exist. A hash helps detect change — it does not prove a label is correct, and we do not claim it does.",
    points: [
      "Dataset and export version, with a checksum",
      "Schema and rubric versions used",
      "Source references or hashes for each task",
      "The frozen set of accepted submission versions",
      "Rights metadata declared by the buyer",
      "Settlement references only where a real transaction exists",
    ],
  },
  export: {
    eyebrow: "Dataset delivery",
    heading: "Deterministic exports from a frozen snapshot.",
    support:
      "An export is built from a specific set of accepted versions and never silently replaced. A regeneration produces a new version, so a delivery you have already validated stays reproducible.",
    files: [
      { name: "annotations.jsonl", note: "Accepted records, one JSON object per line." },
      { name: "annotations.csv", note: "Flattened interval rows for spreadsheet and quick QC." },
      { name: "schema.json", note: "The schema definition the records conform to." },
      { name: "quality_report.json", note: "Acceptance and correction counts, with definitions." },
      { name: "manifest.json", note: "Versions, source references and checksum." },
      { name: "README.md", note: "Field notes and reading guidance for the package." },
    ],
    access:
      "Packages are stored privately. The buyer receives authenticated, expiring download access, and download events are logged.",
  },
  boundaries: {
    eyebrow: "Scope",
    heading: "What the platform does — and does not — do today.",
    support:
      "Shipping one schema that holds up is more useful than implying breadth we do not yet have. These boundaries are deliberate.",
    inScope: [
      "Rights-cleared images and video, streamed per assigned task",
      "Object regions on images, and timestamped action/failure segments on video, against a versioned schema",
      "Automated validation, independent review and appeal",
      "Versioned exports with a quality report and provenance manifest",
      "Acceptance-linked payout states, shown distinctly from submitted and paid",
    ],
    outOfScope: [
      "Depth, LiDAR, point clouds and synchronised multi-sensor annotation",
      "A native token, staking, slashing or speculative incentives",
      "Autonomous AI-only approval for payment decisions",
      "Multi-chain or cross-chain payouts",
      "Unrestricted public access to raw buyer datasets",
    ],
  },
} as const;

export const solutionsPage = {
  eyebrow: "Solutions",
  title: "Built for teams that train on real-world data.",
  lead: "The current release covers images and video: object regions on still images, and timestamped action and failure events on video. Start with the modality that fits your data, prove it, then scale.",
  meta: [
    { label: "Modalities", value: "Images and video" },
    { label: "Task unit", value: "Image regions or video segments" },
    { label: "Delivery", value: "Frozen, versioned export" },
    { label: "Review", value: "Independent, reason-coded" },
  ],
  useCases: [
    {
      id: "manipulation",
      title: "Robotics and embodied AI",
      body: "Reach, grasp, lift, place and recover. Capture the failure events — slip, collision, dropped object — that decide whether a policy generalises to the real world.",
      asset: media.useCaseManipulation,
      labels: ["action segment", "failure event", "outcome"],
    },
    {
      id: "humanoid",
      title: "Medical and life sciences",
      body: "Regions of interest on scans, slides and imagery, labelled consistently across contributors and reviewers.",
      asset: media.useCaseHumanoid,
      labels: ["region", "object", "finding"],
    },
    {
      id: "industrial",
      title: "Industrial inspection",
      body: "Defects, workcell actions and handoffs recorded against a stable schema, so quality can be tracked over time.",
      asset: media.useCaseIndustrial,
      labels: ["defect", "region", "action"],
    },
    {
      id: "autonomous",
      title: "Retail, logistics and agriculture",
      body: "Shelves, packages and field imagery labelled with the schema your pipeline consumes, sliceable by scenario.",
      asset: media.useCaseAutonomous,
      labels: ["detection", "class", "region"],
    },
  ],
  roles: [
    {
      id: "buyers",
      role: "For data and ML teams",
      title: "Commission reviewed data, export it into training.",
      body: "Define the schema and rubric once. Fund a scoped job, monitor quality without managing each contributor, and download a versioned package your pipeline can consume.",
      points: [
        "Create a project with schema, rubric, budget and deadline",
        "Track task states, quality signals and spend reconciliation",
        "Receive JSONL or CSV plus schema, quality report and manifest",
        "Inspect agreed samples within a defined acceptance window",
      ],
    },
    {
      id: "contributors",
      role: "For contributors",
      title: "Scoped paid tasks with the criteria visible up front.",
      body: "See reward, estimated effort, task length and the acceptance rubric before you claim anything. Work in the browser against only your assigned task, with instructions and examples beside you.",
      points: [
        "Claim atomically — no two people annotate the same task",
        "Annotate in the browser without downloading customer data",
        "Specific correction reasons, not a vague rejection",
        "A fair appeal path with a recorded decision",
      ],
    },
    {
      id: "reviewers",
      role: "For reviewers",
      title: "Rubric-driven review with an audit trail.",
      body: "Source media and submission side by side, with validation results, timestamps and required fields already checked. Decide against the rubric and record a reason code.",
      points: [
        "Validation results surfaced before you start",
        "Accept, request correction, reject with reason, or escalate",
        "Reviewer, decision, notes and rubric version recorded",
        "You can never review or approve your own work",
      ],
    },
  ],
} as const;

export const howItWorksPage = {
  eyebrow: "How it works",
  title: "The end-to-end data lifecycle.",
  lead: "Every stage produces a specific, inspectable artifact. Nothing advances on assumption, and nothing becomes payable until it has been accepted under the project rubric.",
  stages: [
    {
      step: "01",
      id: "source",
      title: "Source and segment",
      body: "The buyer uploads rights-cleared images or video to private storage. Jobs are split into short, scoped tasks, each with a unique task ID, reward, deadline and access policy.",
      artifacts: ["Private object", "Task units"],
    },
    {
      step: "02",
      id: "claim",
      title: "Claim and lease",
      body: "A contributor reviews reward, effort, task length and the acceptance rubric, then claims a task. The backend reserves it atomically and issues a time-limited lease, so the queue cannot be captured by one person.",
      artifacts: ["Assignment lease", "Active-task cap"],
    },
    {
      step: "03",
      id: "annotate",
      title: "Annotate and validate",
      body: "The contributor labels actions and failures against the schema in the browser. Client-side checks give fast feedback; the server-side validator is authoritative. A submission creates an immutable version.",
      artifacts: ["Immutable version", "Validation result"],
    },
    {
      step: "04",
      id: "review",
      title: "Review and decide",
      body: "Valid submissions enter human review. A reviewer who did not write the annotation compares it against the source media and rubric, then accepts, requests correction, rejects with a reason, or escalates.",
      artifacts: ["Reason-coded decision", "Review history"],
    },
    {
      step: "05",
      id: "settle",
      title: "Accept and settle",
      body: "Only an accepted version becomes eligible for payment under the published policy. Payouts are idempotent and reconciled against real settlement records; failed transactions stay visibly unpaid.",
      artifacts: ["Payout state", "Settlement record"],
    },
    {
      step: "06",
      id: "deliver",
      title: "Package and deliver",
      body: "A frozen set of accepted versions is packaged with the schema, a quality report and a provenance manifest, then delivered through authenticated, expiring access. Regeneration creates a new version.",
      artifacts: ["Versioned export", "Checksum + manifest"],
    },
  ],
  states: {
    title: "Task states",
    body: "The state machine is explicit, so the interface never collapses distinct situations into one label.",
    chain: [
      "Available",
      "Assigned",
      "Submitted",
      "Validating",
      "In review",
      "Accepted",
      "Eligible",
      "Payment pending",
      "Paid",
    ],
    notes: [
      "Submitted, accepted and paid are three separate states.",
      "A correction request returns the task without rejecting the work.",
      "Payment failed is shown plainly and is never retried into a duplicate.",
      "Rejected work is appealable, and the appeal is adjudicated independently.",
    ],
  },
} as const;

export const aboutPage = {
  eyebrow: "About",
  title: "Quality-assured data operations for machine learning.",
  lead: "Teams building models on real-world images and video need structured labels but often lack the capacity to recruit, train, supervise and pay an annotation workforce. Zeno exists to run that operation for them, with standards that hold up under inspection.",
  thesis: {
    heading: "What we believe",
    body: "A specialised, quality-controlled workflow for machine-learning teams can outperform a generic task marketplace by combining clear rubrics, qualified contributors, automated checks, independent review, provenance and dependable dataset delivery. The value is managed delivery — task decomposition, contributor operations, quality assurance, auditability and usable exports — not a token incentive layer.",
  },
  principles: [
    {
      title: "Honest by default",
      body: "We do not fabricate users, earnings, accepted work or payment confirmations. Empty states explain how to start. Metrics state their definition, sample size and window.",
    },
    {
      title: "Quality is inspectable",
      body: "Every control — validation, review, gold tasks, audits, appeals — is something a buyer can open, count or verify. Trust is an artifact, not a badge.",
    },
    {
      title: "Contributors are treated fairly",
      body: "Criteria and rewards are visible before a task is claimed. Corrections come with reasons. Appeals are adjudicated independently, and rejected work does not silently become payable.",
    },
    {
      title: "Blockchain is a mechanism, not the product",
      body: "Only selected funding, settlement and provenance events may be recorded on-chain. Raw media, PII, annotations and reviewer notes stay off-chain. A hash detects change; it does not prove correctness.",
    },
  ],
  stage: {
    heading: "Where we are",
    body: "Zeno is at the pilot stage. The current release proves one buyer workflow end to end on a single video schema. Nothing on this site describes a customer relationship, certification or payment that has not been verified.",
  },
  roadmap: [
    { phase: "Now", body: "Image and video modalities, claim queue, annotation UI, validation, review, appeal, versioned export, payout states." },
    { phase: "Next", body: "Gold tasks, audit sampling, QA metrics, finer permissions, notifications, reconciliation hardening." },
    { phase: "Later", body: "Additional modalities, automatic routing, buyer APIs and storage integrations — after demand is validated." },
  ],
} as const;

export const explorePage = {
  eyebrow: "Explore the product",
  title: "Walk through the workspace before you sign up.",
  lead: "The product has three role-based surfaces, each built around its own primary job. The previews below run on clearly-labelled sample records, because no platform API is connected in this build.",
  surfaces: [
    {
      to: "/workspace/buyer",
      role: "Buyer workspace",
      title: "What is in flight, what is the quality, what will it cost.",
      body: "Jobs, task states, budget reconciliation, quality signals and export readiness — without managing each contributor.",
    },
    {
      to: "/workspace/contributor",
      role: "Contributor workspace",
      title: "Scoped tasks with visible criteria and honest state.",
      body: "Discover eligible tasks, annotate against the schema, and track submissions, corrections and payouts distinctly.",
    },
    {
      to: "/workspace/reviewer",
      role: "Review console",
      title: "Source beside submission, rubric-driven decisions.",
      body: "Validation results, discrepancies and reason-coded decisions, with a full review history you can read back.",
    },
  ],
  schema: {
    eyebrow: "The first schema",
    heading: "image-boxes-v1 · action-segments-v1",
    body: "An object-region schema for images and a timestamped action-and-failure schema for video. Fields are versioned, so a dataset always declares the schema that produced it.",
    fields: [
      { name: "task_id", note: "The task the record belongs to." },
      { name: "asset_id", note: "Reference to private source media." },
      { name: "schema_version", note: "e.g. action-segments-v1." },
      { name: "segments[]", note: "start_ms, end_ms, action_label, object, outcome, failure_reason, confidence." },
      { name: "notes", note: "Free-text reviewer or contributor context." },
      { name: "submission_hash", note: "Integrity reference for the version." },
      { name: "review_status", note: "Where the record sits in review." },
      { name: "provenance_ref", note: "Link to the manifest entry." },
    ],
    labels: {
      actions: ["reach", "grasp", "lift", "place", "inspect", "recover", "other"],
      outcomes: ["success", "partial", "failure", "unknown"],
      failures: ["slip", "collision", "occlusion", "wrong_target", "dropped_object", "other"],
    },
  },
} as const;
