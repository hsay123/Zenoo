/**
 * Row mapping + ownership helpers for the buyer content pipeline
 * (projects, assets, tasks).
 */

import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/auth/verifyToken";
import { buyerOwnsProject } from "@/lib/jobs/repository";
import type { Asset, Project } from "@/src/types/api";

export const PROJECT_COLUMNS = "id, buyer_id, name, data_rights, retention_policy, created_at";
export const ASSET_COLUMNS =
  "id, project_id, content_hash, modality, duration_ms, width, height, consent_ref";

export function toProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    buyer_id: row.buyer_id as string,
    name: row.name as string,
    data_rights: (row.data_rights as string | null) ?? null,
    retention_policy: (row.retention_policy as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export function toAsset(row: Record<string, unknown>): Asset {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    content_hash: row.content_hash as string,
    modality: row.modality as Asset["modality"],
    duration_ms: (row.duration_ms as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    consent_ref: (row.consent_ref as string | null) ?? null,
  };
}

/** Throw 403 unless the actor is an admin or owns the project. */
export async function assertProjectAccess(
  projectId: string,
  actor: AuthUser,
): Promise<void> {
  if (actor.role === "admin") return;
  const owns = await buyerOwnsProject(projectId, actor.id);
  if (!owns) throw HttpError.forbidden("Project not found or not owned by you");
}

/**
 * Asset objects must live under their project's prefix. This blocks a buyer
 * from registering a signed upload against another project's object key.
 */
export function objectKeyPrefix(projectId: string): string {
  return `projects/${projectId}/`;
}

export function assertObjectKeyInProject(projectId: string, objectKey: string): void {
  if (!objectKey.startsWith(objectKeyPrefix(projectId))) {
    throw HttpError.badRequest(
      `object_key must start with '${objectKeyPrefix(projectId)}'`,
    );
  }
}

/** Load assets by id, asserting they all belong to the given project. */
export async function loadProjectAssets(
  projectId: string,
  assetIds: string[],
): Promise<Asset[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select(ASSET_COLUMNS)
    .eq("project_id", projectId)
    .in("id", assetIds);
  if (error) throw HttpError.internal(`Failed to load assets: ${error.message}`);

  const found = (data ?? []).map((row) => toAsset(row as Record<string, unknown>));
  const foundIds = new Set(found.map((a) => a.id));
  const missing = assetIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw HttpError.unprocessable("Some assets were not found in this project", [
      { path: ["asset_ids"], message: `unknown asset ids: ${missing.join(", ")}` },
    ]);
  }
  return found;
}
