/**
 * Content-pipeline validation tests (pure).
 */

import { describe, it, expect } from "vitest";
import {
  createAssetSchema,
  createProjectSchema,
  createTasksSchema,
  uploadUrlSchema,
} from "../content";
import { assertObjectKeyInProject, objectKeyPrefix } from "@/lib/content/repository";
import { HttpError } from "@/lib/api/errors";

const UUID = "5eed0000-0000-4000-8000-000000000001";

describe("createProjectSchema", () => {
  it("requires a non-empty name", () => {
    expect(() => createProjectSchema.parse({ name: "  " })).toThrow();
  });

  it("accepts optional rights fields", () => {
    const p = createProjectSchema.parse({ name: "Tabletop", data_rights: "owned" });
    expect(p.name).toBe("Tabletop");
    expect(p.data_rights).toBe("owned");
  });
});

describe("uploadUrlSchema", () => {
  it("accepts a valid request", () => {
    const p = uploadUrlSchema.parse({
      project_id: UUID,
      modality: "video",
      filename: "clip.mp4",
    });
    expect(p.modality).toBe("video");
  });

  it("rejects a non-uuid project id", () => {
    expect(() =>
      uploadUrlSchema.parse({ project_id: "nope", modality: "image", filename: "a.jpg" }),
    ).toThrow();
  });
});

describe("createAssetSchema", () => {
  it("accepts an image with dimensions", () => {
    const p = createAssetSchema.parse({
      project_id: UUID,
      modality: "image",
      object_key: `projects/${UUID}/a.jpg`,
      content_hash: "abcdef0123456789",
      width: 1280,
      height: 800,
    });
    expect(p.width).toBe(1280);
  });

  it("rejects an image without dimensions", () => {
    expect(() =>
      createAssetSchema.parse({
        project_id: UUID,
        modality: "image",
        object_key: `projects/${UUID}/a.jpg`,
        content_hash: "abcdef0123456789",
      }),
    ).toThrow();
  });

  it("rejects a video without duration_ms", () => {
    expect(() =>
      createAssetSchema.parse({
        project_id: UUID,
        modality: "video",
        object_key: `projects/${UUID}/a.mp4`,
        content_hash: "abcdef0123456789",
      }),
    ).toThrow();
  });

  it("accepts a video with duration_ms", () => {
    const p = createAssetSchema.parse({
      project_id: UUID,
      modality: "video",
      object_key: `projects/${UUID}/a.mp4`,
      content_hash: "abcdef0123456789",
      duration_ms: 12000,
    });
    expect(p.duration_ms).toBe(12000);
  });
});

describe("createTasksSchema", () => {
  it("defaults is_gold to false", () => {
    const p = createTasksSchema.parse({ asset_ids: [UUID] });
    expect(p.is_gold).toBe(false);
  });

  it("requires at least one asset id", () => {
    expect(() => createTasksSchema.parse({ asset_ids: [] })).toThrow();
  });

  it("rejects non-uuid asset ids", () => {
    expect(() => createTasksSchema.parse({ asset_ids: ["nope"] })).toThrow();
  });
});

describe("object key guard", () => {
  it("accepts a key under the project prefix", () => {
    expect(() =>
      assertObjectKeyInProject(UUID, `${objectKeyPrefix(UUID)}x.jpg`),
    ).not.toThrow();
  });

  it("rejects a key for another project", () => {
    expect(() =>
      assertObjectKeyInProject(UUID, "projects/other-project/x.jpg"),
    ).toThrow(HttpError);
  });
});
