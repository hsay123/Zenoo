# Zeno Data API — plan

> Status: **PLAN, awaiting approval** (2026-10-29). Nothing here is built yet.
> When built, every section flips from *planned* to **[live]**.

## 1. The problem it solves

A startup that bought labels today has to download one big export per job, then
write its own script to reshape it (COCO → YOLO, rename classes, drop what it
doesn't need, split train/val, fetch every image) before training can start.
With thousands of labels across many jobs, that is the slow part.

The Data API lets the startup **ask for exactly the labels it needs, already in
the shape its training code reads**, page by page or as one stream, plus a
short-lived link to each image or video instead of a bulk download.

```
startup's training script                       Zeno
─────────────────────────                       ─────
GET /api/v1/datasets                 ───────►   which datasets can this key read?
GET /api/v1/datasets/{id}/labels                accepted labels only, filtered,
    ?format=yolo&classes=cup,hand    ───────►   transformed, paginated
    &split=train:0.8,val:0.2
    &media=signed_url&cursor=…       ◄───────   records + next_cursor
GET (signed media URL, 15 min)       ───────►   Supabase Storage (private bucket)
```

## 2. Who can read what

- A **dataset** is one of the organisation's jobs. Only **accepted** (or paid)
  labels are ever returned; drafts, rejected work and contributor identity never
  leave Zeno (same rule as today's export).
- Keys belong to a **buyer organisation**. A key reads only that organisation's
  datasets. Licensed third-party datasets (company-supplied data with royalties)
  come later, once that model is decided (see `BUSINESS-MODEL` discussion).
- Read-only. The API cannot create, fund, pay or delete anything.

## 3. Authentication: API keys

| | |
| --- | --- |
| Format | `zeno_test_<32 random bytes, base62>` on Base Sepolia (`zeno_live_` reserved for later) |
| Storage | Only a SHA-256 hash plus the first 8 characters (to show in the UI) is stored; the key is shown **once** |
| Sent as | `Authorization: Bearer zeno_test_…` |
| Scopes | `datasets:read`, `labels:read`, `media:read` (all on by default for v1) |
| Lifecycle | Create, list, revoke from **Buyer → API keys**; `last_used_at` recorded |
| Separation | `/api/v1/*` accepts **only** API keys; the app's own routes keep accepting **only** Privy tokens. `resolveUser` is not touched. |

Management endpoints (Privy-authenticated, buyer role):
`POST /api/api-keys` (returns the key once) · `GET /api/api-keys` · `DELETE /api/api-keys/{id}`.

## 4. Endpoints (`/api/v1`, API key)

| Method & path | Returns |
| --- | --- |
| `GET /api/v1/datasets` | The organisation's datasets: id, title, modality, schema, class list, accepted count, updated_at |
| `GET /api/v1/datasets/{id}` | One dataset plus its provenance manifest (rights, review policy, counts) |
| `GET /api/v1/datasets/{id}/labels` | Accepted labels, filtered and transformed, paginated |
| `GET /api/v1/datasets/{id}/labels/stream` | The same records as NDJSON in one response, for large pulls |
| `GET /api/v1/usage` | This month's request and record counts for the key's organisation |
| `GET /api/v1/openapi.json` | The machine-readable spec (no auth) |

### 4.1 `labels` query parameters

| Parameter | Example | Meaning |
| --- | --- | --- |
| `format` | `zeno` (default) · `coco` · `yolo` · `jsonl` · `csv` | Output shape (YOLO for images only) |
| `classes` | `cup,hand` | Keep only these classes; records left with no boxes are dropped |
| `rename` | `cup:mug,hand:gripper` | Rename classes on the way out |
| `bbox` | `xywh` (default) · `xyxy` · `normalized` | Box coordinates (normalised = 0–1 by image size) |
| `split` | `train:0.8,val:0.2` | Adds a `split` field; deterministic per asset hash, so a record never changes split between pulls |
| `since` | `2026-10-29T00:00:00Z` | Only labels accepted after this time: incremental sync |
| `reviewer` | `human` · `ai` | Only labels accepted by this reviewer type |
| `fields` | `asset_id,boxes,split` | Return only these fields |
| `media` | `none` (default) · `signed_url` | Add a 15-minute signed URL per asset |
| `limit` | `500` | Page size, 1–1000 (default 100) |
| `cursor` | from the last page | Next page; opaque, stable under new acceptances |

### 4.2 Response (paginated)

```json
{
  "data": [
    { "asset_id": "…", "asset_hash": "…", "width": 640, "height": 480,
      "split": "train", "boxes": [{ "class": "mug", "x": 12, "y": 40, "w": 80, "h": 60 }],
      "reviewer_type": "human", "accepted_at": "…", "receipt_tx_hash": "0x…",
      "media_url": "https://…signed…" }
  ],
  "next_cursor": "eyJ…",
  "meta": { "dataset_id": "…", "format": "zeno", "count": 100, "schema_version": "image-boxes-v1" }
}
```

YOLO pages return one entry per image: `{ "asset_id", "file": "<asset_id>.txt",
"lines": ["0 0.12 0.40 0.08 0.06", …] }` plus `meta.classes` (the index order),
so writing a YOLO folder is two loops.

Errors use the existing envelope `{ "error": { "code", "message" } }` with
`401` (missing or revoked key), `403` (another organisation's dataset), `404`,
`422` (bad parameter, message names it) and `429` (rate limit, `Retry-After`).

## 5. Limits and plans

| Plan | Price | API | Rate limit | Records per month |
| --- | --- | --- | --- | --- |
| Pay as you go | $0 | web export only | — | — |
| **API** (Dodo product `pdt_0NqnRXLpnaNkUZ7NOb05Z`) | $299 / month | ✅ | 600 requests/min | unlimited |

For the hackathon the subscription is **test mode**: a buyer subscribes with
Dodo's test card, `subscription.active` sets `api_plan = 'api'` on the
organisation, `subscription.cancelled`/`expired` clears it. Keys can be created
any time; `/api/v1` answers `402 plan_required` until the plan is active.
(Commission discounts per plan are a business decision, kept out of v1.)

## 6. Data model (migration 015)

```
api_keys(id, organization_id, created_by, name, prefix, key_hash UNIQUE,
         scopes text[], last_used_at, revoked_at, created_at)
api_usage(organization_id, month, requests, records)  -- upserted per request
organizations + api_plan text DEFAULT 'none', api_plan_subscription_id text
```

RLS on, no `anon`/`authenticated` privileges (same as every table); the service
role is the only reader.

## 7. Performance

- One query per page: accepted tasks → latest submission → accepting review,
  ordered by `(accepted_at, task_id)` for a stable keyset cursor; an index
  `tasks(job_id, status, updated_at)` is added in 015.
- Transformation is pure functions over the page (no extra queries).
- Signed URLs are created in one batched Storage call per page.
- The stream endpoint pages internally (1000 at a time) and writes NDJSON as it
  goes, so memory stays flat for any dataset size.

## 8. Developer documentation (deliverables)

1. `docs/api/README.md`: quickstart (create a key, first call, curl), auth,
   errors, pagination, rate limits.
2. `docs/api/openapi.yaml` → served at `/api/v1/openapi.json`.
3. Recipes: **train YOLOv8** (Python, writes `images/` + `labels/` from one
   loop), **COCO for Detectron2**, **incremental sync** with `since`,
   **streaming** with `requests.iter_lines()`, TypeScript `fetch` example.
4. A **Developers** page in the app (`/developers`) rendering the quickstart,
   and the **API keys** screen in the buyer workspace.

## 9. Build order and tests

| Step | What | Tests |
| --- | --- | --- |
| 1 | Migration 015, key generation/hashing, management routes, buyer **API keys** screen | Unit: hashing, prefix, revoke; route: buyer-only, key shown once |
| 2 | `/api/v1` auth + rate limit + usage counter | Unit: bad/revoked key 401, other org 403, 429 |
| 3 | Transform library: classes, rename, bbox modes, split, fields, YOLO, COCO | Unit: every transform, deterministic split, YOLO normalisation |
| 4 | `datasets`, `labels` (cursor), `stream`, signed media | Unit + e2e: create a key, pull a real accepted dataset in YOLO |
| 5 | Dodo `API` plan checkout + `subscription.*` webhook → `api_plan` | Unit: webhook signature + state changes; test-mode checkout |
| 6 | OpenAPI spec, docs, recipes, `/developers` page | Spec validated; recipe run against the local stack |

Checks after each step: backend typecheck, lint, tests, build; frontend the same.

## 10. Out of scope for v1

Write endpoints (creating jobs over the API), licensed third-party datasets and
royalties, per-key webhooks, SDK packages, live mode.

## 11. Decisions needed

1. **Plan gate:** API access only on the $299 plan (as above), or free for every
   buyer during the hackathon with the plan shown as "coming soon"?
2. **Key format and prefix:** `zeno_test_…` OK?
3. **YOLO for video:** video jobs export action segments, not boxes; v1 offers
   `zeno`/`jsonl`/`csv` for video and returns `422` for `format=yolo|coco`. OK?
