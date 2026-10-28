/**
 * Seed script: npm run seed
 *
 * Creates:
 *   - 1 admin
 *   - 1 buyer
 *   - 2 contributors
 *   - 1 reviewer
 *   - 1 project owned by buyer
 *   - 2 assets (1 image, 1 video)
 *   - 1 image job with 3 tasks (1 gold)
 *   - 1 video job with 3 tasks (1 gold)
 *
 * Placeholder media keys: put real files at
 *   supabase/seed-media/image_task_001.jpg
 *   supabase/seed-media/video_task_001.mp4
 * and upload them to your private Supabase Storage bucket manually,
 * or update the object_key values below.
 *
 * Usage: npm run seed
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

/**
 * Deterministic, valid UUIDs for seed rows.
 * Postgres `uuid` columns require canonical hex UUIDs, so these replace the
 * earlier human-readable (but invalid) "seed-*" ids. They are stable so that
 * requests.http and the README can reference them.
 */
export const SEED_IDS = {
  admin: "5eed0000-0000-4000-8000-000000000001",
  buyer: "5eed0000-0000-4000-8000-000000000002",
  contributor1: "5eed0000-0000-4000-8000-000000000003",
  contributor2: "5eed0000-0000-4000-8000-000000000004",
  reviewer: "5eed0000-0000-4000-8000-000000000005",
  project: "5eed0000-0000-4000-8000-000000000010",
  imageAsset: "5eed0000-0000-4000-8000-000000000020",
  videoAsset: "5eed0000-0000-4000-8000-000000000021",
  imageJob: "5eed0000-0000-4000-8000-000000000030",
  videoJob: "5eed0000-0000-4000-8000-000000000031",
  imageTask1: "5eed0000-0000-4000-8000-000000000040",
  imageTask2: "5eed0000-0000-4000-8000-000000000041",
  imageTask3Gold: "5eed0000-0000-4000-8000-000000000042",
  videoTask1: "5eed0000-0000-4000-8000-000000000050",
  videoTask2: "5eed0000-0000-4000-8000-000000000051",
  videoTask3Gold: "5eed0000-0000-4000-8000-000000000052",
} as const;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upsert<T extends object>(table: string, data: T, conflictCol = "id"): Promise<T> {
  const { data: row, error } = await db
    .from(table)
    .upsert(data as Record<string, unknown>, { onConflict: conflictCol, ignoreDuplicates: false })
    .select()
    .single();
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
  return row as T;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Users ──────────────────────────────────────────────────
  const admin = await upsert("users", {
    id: SEED_IDS.admin,
    privy_did: "did:privy:seed-admin",
    email: "admin@physicaldata.dev",
    wallet_address: "0xADMIN00000000000000000000000000000000001",
    role: "admin",
    status: "active",
  });
  console.log("  ✓ admin:", admin.id);

  const buyer = await upsert("users", {
    id: SEED_IDS.buyer,
    privy_did: "did:privy:seed-buyer",
    email: "buyer@physicaldata.dev",
    wallet_address: "0xBUYER00000000000000000000000000000000002",
    role: "buyer",
    status: "active",
  });
  console.log("  ✓ buyer:", buyer.id);

  const contributor1 = await upsert("users", {
    id: SEED_IDS.contributor1,
    privy_did: "did:privy:seed-contributor-1",
    email: "contributor1@physicaldata.dev",
    wallet_address: "0xCONTRIB100000000000000000000000000000003",
    role: "contributor",
    status: "active",
  });
  console.log("  ✓ contributor1:", contributor1.id);

  const contributor2 = await upsert("users", {
    id: SEED_IDS.contributor2,
    privy_did: "did:privy:seed-contributor-2",
    email: "contributor2@physicaldata.dev",
    wallet_address: "0xCONTRIB200000000000000000000000000000004",
    role: "contributor",
    status: "active",
  });
  console.log("  ✓ contributor2:", contributor2.id);

  const reviewer = await upsert("users", {
    id: SEED_IDS.reviewer,
    privy_did: "did:privy:seed-reviewer",
    email: "reviewer@physicaldata.dev",
    wallet_address: "0xREVIEWER0000000000000000000000000000005",
    role: "reviewer",
    status: "active",
  });
  console.log("  ✓ reviewer:", reviewer.id);

  // ── Contributor profiles ────────────────────────────────────
  for (const userId of [contributor1.id, contributor2.id]) {
    await upsert(
      "contributor_profiles",
      { user_id: userId, qualification_passed: true, qualification_score: 85.0 },
      "user_id",
    );
  }
  console.log("  ✓ contributor_profiles created");

  // ── Project ─────────────────────────────────────────────────
  const project = await upsert("projects", {
    id: SEED_IDS.project,
    buyer_id: buyer.id,
    name: "Robot Manipulation Study",
    data_rights: "Buyer attests the media is synthetic or rights-cleared.",
    retention_policy: "90 days post-job-close",
  });
  console.log("  ✓ project:", project.id);

  // ── Assets ──────────────────────────────────────────────────
  const imageAsset = await upsert("assets", {
    id: SEED_IDS.imageAsset,
    project_id: project.id,
    object_key: "seed-media/image_task_001.jpg",   // PUT your file here
    content_hash: "0xplaceholder-image-hash",
    modality: "image",
    width: 1280,
    height: 720,
    consent_ref: "seed-consent-image",
  });
  console.log("  ✓ imageAsset:", imageAsset.id);

  const videoAsset = await upsert("assets", {
    id: SEED_IDS.videoAsset,
    project_id: project.id,
    object_key: "seed-media/video_task_001.mp4",   // PUT your file here
    content_hash: "0xplaceholder-video-hash",
    modality: "video",
    duration_ms: 12000,
    consent_ref: "seed-consent-video",
  });
  console.log("  ✓ videoAsset:", videoAsset.id);

  // ── Jobs ─────────────────────────────────────────────────────
  const imageJob = await upsert("jobs", {
    id: SEED_IDS.imageJob,
    project_id: project.id,
    schema_version_id: "a0000000-0000-0000-0000-000000000001",
    title: "Cup and Block Detection",
    description: "Draw bounding boxes around all cups and blocks in each image.",
    modality: "image",
    reward_per_task: "1.5",
    budget: "100.0",
    policy_hash: "0xpolicy-hash-image-job",
    rubric: {
      accepted_iou: 0.5,
      note: "All cups and red_blocks must be labelled. Partial boxes penalised.",
    },
    label_list: ["cup", "red_block", "blue_block", "hand", "robot_arm", "other"],
    status: "published",
  });
  console.log("  ✓ imageJob:", imageJob.id);

  const videoJob = await upsert("jobs", {
    id: SEED_IDS.videoJob,
    project_id: project.id,
    schema_version_id: "a0000000-0000-0000-0000-000000000002",
    title: "Manipulation Action Segments",
    description: "Mark start and end times for each robot manipulation action.",
    modality: "video",
    reward_per_task: "2.5",
    budget: "150.0",
    policy_hash: "0xpolicy-hash-video-job",
    rubric: {
      timing_tolerance_ms: 500,
      note: "Segments must not overlap. failure_reason required for failure outcomes.",
    },
    label_list: ["reach", "grasp", "lift", "place", "inspect", "recover", "write", "other"],
    status: "published",
  });
  console.log("  ✓ videoJob:", videoJob.id);

  // ── Tasks (image job) ────────────────────────────────────────
  const imageTasks = [
    {
      id: SEED_IDS.imageTask1,
      job_id: imageJob.id,
      asset_id: imageAsset.id,
      modality: "image",
      status: "available",
      is_gold: false,
    },
    {
      id: SEED_IDS.imageTask2,
      job_id: imageJob.id,
      asset_id: imageAsset.id,
      modality: "image",
      status: "available",
      is_gold: false,
    },
    {
      id: SEED_IDS.imageTask3Gold,  // gold task
      job_id: imageJob.id,
      asset_id: imageAsset.id,
      modality: "image",
      status: "available",
      is_gold: true,
      gold_answer: {
        boxes: [
          { x: 120, y: 80, w: 90, h: 110, class: "cup" },
          { x: 300, y: 210, w: 40, h: 40, class: "red_block" },
        ],
      },
    },
  ];

  for (const task of imageTasks) {
    await upsert("tasks", task);
  }
  console.log("  ✓ image tasks created (1 gold)");

  // ── Tasks (video job) ────────────────────────────────────────
  const videoTasks = [
    {
      id: SEED_IDS.videoTask1,
      job_id: videoJob.id,
      asset_id: videoAsset.id,
      modality: "video",
      status: "available",
      is_gold: false,
    },
    {
      id: SEED_IDS.videoTask2,
      job_id: videoJob.id,
      asset_id: videoAsset.id,
      modality: "video",
      status: "available",
      is_gold: false,
    },
    {
      id: SEED_IDS.videoTask3Gold,  // gold task
      job_id: videoJob.id,
      asset_id: videoAsset.id,
      modality: "video",
      status: "available",
      is_gold: true,
      gold_answer: {
        segments: [
          { start_ms: 0, end_ms: 1200, action_label: "reach", outcome: "success" },
          { start_ms: 1200, end_ms: 3400, action_label: "grasp", outcome: "success" },
          { start_ms: 3400, end_ms: 4000, action_label: "lift", outcome: "success" },
          { start_ms: 4000, end_ms: 11000, action_label: "write", outcome: "success" },
          { start_ms: 11000, end_ms: 12000, action_label: "place", outcome: "success" },
        ],
      },
    },
  ];

  for (const task of videoTasks) {
    await upsert("tasks", task);
  }
  console.log("  ✓ video tasks created (1 gold)");

  console.log("\n✅ Seed complete!");
  console.log("\nDEV auth bypass credentials (use header x-dev-user-id):");
  console.log("  admin:        ", admin.id);
  console.log("  buyer:        ", buyer.id);
  console.log("  contributor1: ", contributor1.id);
  console.log("  contributor2: ", contributor2.id);
  console.log("  reviewer:     ", reviewer.id);
  console.log("\nPlace placeholder media files at:");
  console.log("  supabase/seed-media/image_task_001.jpg");
  console.log("  supabase/seed-media/video_task_001.mp4");
  console.log("Then upload them to your private Supabase Storage bucket under the same paths.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
