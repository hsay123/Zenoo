/**
 * OpenAPI 3.1 description of the Zeno Data API, served at
 * GET /api/v1/openapi.json. Keep it in step with docs/api/README.md.
 */

import { BBOX_MODES, LABEL_FORMATS, STREAM_FORMATS } from "@/lib/dataapi/transform";
import { MAX_LIMIT } from "@/lib/dataapi/repository";

const errorRef = { $ref: "#/components/responses/Error" };
const errors = { 401: errorRef, 402: errorRef, 404: errorRef, 422: errorRef, 429: errorRef };

const filterParams = [
  { name: "classes", in: "query", schema: { type: "string" }, example: "cup,hand", description: "Keep only these classes (original names). Records left with no boxes or segments are dropped." },
  { name: "rename", in: "query", schema: { type: "string" }, example: "cup:mug,hand:gripper", description: "Rename classes on the way out (from:to pairs)." },
  { name: "bbox", in: "query", schema: { type: "string", enum: [...BBOX_MODES], default: "xywh" }, description: "Box coordinates: pixels as x,y,w,h; pixels as x,y,x2,y2; or x,y,w,h normalised to 0–1." },
  { name: "split", in: "query", schema: { type: "string" }, example: "train:0.8,val:0.2", description: "Adds a split field, deterministic per asset: a record never changes split between pulls." },
  { name: "since", in: "query", schema: { type: "string", format: "date-time" }, description: "Only labels accepted or updated after this time (incremental sync)." },
  { name: "reviewer", in: "query", schema: { type: "string", enum: ["human", "ai"] }, description: "Only labels accepted by this reviewer type." },
  { name: "fields", in: "query", schema: { type: "string" }, example: "asset_id,boxes,split", description: "Return only these fields (zeno format)." },
];

export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Zeno Data API",
      version: "1.0.0",
      description:
        "Read accepted, human-reviewed labels from your Zeno datasets in the shape your training code needs. Test mode (Base Sepolia). Requires the API plan.",
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "A Zeno API key: zeno_test_…" },
      },
      responses: {
        Error: {
          description: "Error envelope",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: {
                    type: "object",
                    properties: {
                      code: { type: "string", enum: ["UNAUTHORIZED", "PLAN_REQUIRED", "FORBIDDEN", "NOT_FOUND", "VALIDATION_ERROR", "RATE_LIMIT", "INTERNAL_ERROR"] },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      schemas: {
        Dataset: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            modality: { type: "string", enum: ["image", "video"] },
            schema_version: { type: "string", enum: ["image-boxes-v1", "action-segments-v1"] },
            classes: { type: "array", items: { type: "string" } },
            status: { type: "string" },
            accepted_count: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        Box: {
          type: "object",
          properties: {
            class: { type: "string" },
            x: { type: "number" }, y: { type: "number" },
            w: { type: "number" }, h: { type: "number" },
            x2: { type: "number", description: "bbox=xyxy only" },
            y2: { type: "number", description: "bbox=xyxy only" },
            confidence: { type: "number" },
          },
        },
        LabelRecord: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            asset_id: { type: "string" },
            asset_hash: { type: "string" },
            modality: { type: "string" },
            schema_version: { type: "string" },
            width: { type: ["integer", "null"] },
            height: { type: ["integer", "null"] },
            reviewer_type: { type: "string", enum: ["human", "ai", "code"] },
            accepted_at: { type: ["string", "null"], format: "date-time" },
            payload_hash: { type: "string" },
            receipt_tx_hash: { type: ["string", "null"], description: "On-chain payout for this label (Base Sepolia)" },
            split: { type: "string" },
            boxes: { type: "array", items: { $ref: "#/components/schemas/Box" } },
            segments: { type: "array", items: { type: "object" } },
            media_url: { type: ["string", "null"], description: "media=signed_url only; valid 15 minutes" },
          },
        },
      },
    },
    paths: {
      "/api/v1/datasets": {
        get: {
          summary: "List your datasets",
          responses: { 200: { description: "Datasets", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Dataset" } } } } } } }, ...errors },
        },
      },
      "/api/v1/datasets/{id}": {
        get: {
          summary: "One dataset with provenance",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { 200: { description: "Dataset" }, ...errors },
        },
      },
      "/api/v1/datasets/{id}/labels": {
        get: {
          summary: "Accepted labels, filtered and shaped, one page at a time",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "format", in: "query", schema: { type: "string", enum: [...LABEL_FORMATS], default: "zeno" }, description: "zeno records; COCO (images, annotations, categories); YOLO lines per image. coco/yolo are for image datasets." },
            ...filterParams,
            { name: "media", in: "query", schema: { type: "string", enum: ["none", "signed_url"], default: "none" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: 100 } },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "next_cursor from the previous page" },
          ],
          responses: {
            200: {
              description: "A page",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { description: "zeno: LabelRecord[]; coco: { images, annotations, categories }; yolo: { asset_id, file, width, height, lines }[]" },
                      next_cursor: { type: ["string", "null"] },
                      meta: { type: "object" },
                    },
                  },
                },
              },
            },
            ...errors,
          },
        },
      },
      "/api/v1/datasets/{id}/labels/stream": {
        get: {
          summary: "Every accepted label in one streamed response",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "format", in: "query", schema: { type: "string", enum: [...STREAM_FORMATS], default: "jsonl" } },
            ...filterParams,
          ],
          responses: {
            200: {
              description: "NDJSON (one LabelRecord per line) or CSV (one row per box or segment)",
              content: { "application/x-ndjson": {}, "text/csv": {} },
            },
            ...errors,
          },
        },
      },
      "/api/v1/usage": {
        get: { summary: "This month's usage for your organization", responses: { 200: { description: "Usage" }, ...errors } },
      },
    },
  };
}
