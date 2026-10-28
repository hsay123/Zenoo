"use client";

import {
  PlatformError,
  assetSchema,
  platformPaths,
  uploadUrlResultSchema,
  type Asset,
  type PlatformClient,
} from "../api/platform";

/**
 * Media upload pipeline: mint a signed URL, PUT the bytes to object storage,
 * then register the asset with the platform. Kept out of the wizard so the
 * same real flow can be reused by any buyer screen.
 */

export type Modality = "image" | "video";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function probeImage(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

function probeVideo(file: File): Promise<{ duration_ms: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const durationMs = Math.round(video.duration * 1000);
      URL.revokeObjectURL(url);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        reject(new Error(`Could not read a duration from ${file.name}`));
      } else {
        resolve({ duration_ms: durationMs });
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read video metadata from ${file.name}`));
    };
    video.src = url;
  });
}

export type UploadResult = { asset: Asset; filename: string };

/**
 * Upload one file into a project and register it as an asset. Throws a
 * `PlatformError` on any failure so the caller can render it.
 */
export async function uploadAsset(
  client: PlatformClient,
  options: { projectId: string; modality: Modality; file: File },
): Promise<UploadResult> {
  const { projectId, modality, file } = options;

  const upload = await client.post(uploadUrlResultSchema, platformPaths.uploadUrl(), {
    body: {
      project_id: projectId,
      modality,
      filename: file.name,
      content_type: file.type || undefined,
    },
  });

  let put: Response;
  try {
    put = await fetch(upload.upload_url, {
      method: upload.method ?? "PUT",
      body: file,
      headers: { "content-type": file.type || "application/octet-stream" },
    });
  } catch (cause) {
    throw new PlatformError(
      "NETWORK",
      cause instanceof Error ? cause.message : "Upload failed",
    );
  }
  if (!put.ok) {
    throw new PlatformError(
      "SERVER",
      `Uploading ${file.name} failed (${put.status} ${put.statusText})`,
    );
  }

  const contentHash = await sha256Hex(file);
  const dimensions =
    modality === "image" ? await probeImage(file) : await probeVideo(file);

  const asset = await client.post(assetSchema, platformPaths.assets(), {
    body: {
      project_id: projectId,
      modality,
      object_key: upload.object_key,
      content_hash: contentHash,
      size_bytes: file.size,
      ...dimensions,
    },
  });

  return { asset, filename: file.name };
}
