# Zeno Data API

Pull accepted, human-reviewed labels from your Zeno datasets **in the shape your
training code reads**: COCO, YOLO or Zeno JSON, only the classes you want,
renamed, in the box format you use, already split into train/val, page by page
or as one stream, with short-lived links to the media. No bulk downloads and no
reshaping scripts.

- Base URL: `https://zenolab-api.vercel.app`
- Spec: [`/api/v1/openapi.json`](https://zenolab-api.vercel.app/api/v1/openapi.json) (OpenAPI 3.1)
- Plan: the **API plan, $299/month** (Dodo Payments; test mode during HHG 2026)
- Network: Base Sepolia test mode. Labels carry the on-chain payout tx of the
  contributor who made them.

## 1. Get a key

1. In Zeno, open **Buyer → API**.
2. Click **Subscribe — $299/month** and pay in Dodo's test checkout with a
   Dodo test card (`4242 4242 4242 4242`, expiry 06/32, CVV 123; in India
   `4576 2389 1277 1450`). The plan turns on as soon as Dodo confirms the
   subscription.
3. Under **API keys**, name a key and click **Create key**. Copy it: it is
   shown **once**. Keys look like `zeno_test_…`, belong to your organization
   and read only its datasets. Revoke a key there at any time.

Keep keys on servers and in CI secrets. Never put one in a web page or a repo.

```bash
export ZENO_API_KEY=zeno_test_...
export ZENO=https://zenolab-api.vercel.app
curl -H "Authorization: Bearer $ZENO_API_KEY" "$ZENO/api/v1/datasets"
```

## 2. Endpoints

| Method & path | Returns |
| --- | --- |
| `GET /api/v1/datasets` | Your datasets: id, title, modality, schema, classes, accepted_count |
| `GET /api/v1/datasets/{id}` | One dataset plus provenance (rights, retention, review policy, funding tx) |
| `GET /api/v1/datasets/{id}/labels` | Accepted labels, filtered and shaped, one page at a time |
| `GET /api/v1/datasets/{id}/labels/stream` | Every accepted label in one response: NDJSON or CSV |
| `GET /api/v1/usage` | This month's requests and records |
| `GET /api/v1/openapi.json` | The spec (no key needed) |

### `labels` parameters

| Parameter | Example | Meaning |
| --- | --- | --- |
| `format` | `zeno` (default), `coco`, `yolo` | Page shape. `coco`/`yolo` are for image datasets |
| `classes` | `cup,hand` | Keep only these classes (original names); records with none left are dropped |
| `rename` | `cup:mug,hand:gripper` | Rename classes on the way out |
| `bbox` | `xywh` (default), `xyxy`, `normalized` | Pixels as x,y,w,h; pixels as x,y,x2,y2; or x,y,w,h in 0–1 |
| `split` | `train:0.8,val:0.2` | Adds `split`; deterministic per asset, stable across pulls |
| `since` | `2026-10-29T00:00:00Z` | Only labels accepted or updated after this time |
| `reviewer` | `human`, `ai` | Only labels accepted by this reviewer type |
| `fields` | `asset_id,boxes,split` | Return only these fields (`zeno` format) |
| `media` | `none` (default), `signed_url` | Adds `media_url` per asset, valid 15 minutes |
| `limit` | `500` | Page size, 1–1000 (default 100) |
| `cursor` | from `next_cursor` | The next page. `null` means you have everything |

`/labels/stream` takes the same filters (not `limit`, `cursor` or `media`) and
`format=jsonl` (default, one Zeno record per line) or `format=csv` (one row per
box or segment).

### Shapes

```jsonc
// format=zeno (one record per accepted image or video)
{ "task_id": "…", "asset_id": "…", "asset_hash": "…", "modality": "image",
  "width": 640, "height": 480, "reviewer_type": "human", "accepted_at": "…",
  "receipt_tx_hash": "0x…", "split": "train",
  "boxes": [{ "class": "mug", "x": 12, "y": 40, "w": 80, "h": 60 }],
  "media_url": "https://…" }

// format=yolo: one entry per image, meta.classes is the index order
{ "asset_id": "…", "file": "<asset_id>.txt", "width": 640, "height": 480,
  "lines": ["0 0.125 0.146 0.125 0.125"] }

// format=coco: { images, annotations, categories } for this page.
// image ids are asset ids (strings, stable across pages); categories are 1-based.
```

Video datasets return `segments` (`start_ms`, `end_ms`, `action_label`,
`outcome`, `confidence`) in `zeno`/`jsonl`/`csv`; `classes` and `rename` apply
to `action_label`.

### Errors and limits

Errors use `{ "error": { "code", "message" } }`:
`401` missing, malformed or revoked key · `402 PLAN_REQUIRED` no active API plan ·
`404` not your dataset (or not found) · `422` a bad parameter (the message names
it) · `429` over **600 requests per minute per key**. Only accepted labels are
ever returned, and never any contributor identity. `/api/v1/usage` counts
successful requests (errors are not counted).

## 3. Recipes

### Train YOLOv8 (Python)

```python
import os, pathlib, requests

ZENO, KEY = "https://zenolab-api.vercel.app", os.environ["ZENO_API_KEY"]
DATASET = "<dataset id>"
H = {"Authorization": f"Bearer {KEY}"}
root = pathlib.Path("zeno-yolo")

params = {"format": "yolo", "split": "train:0.8,val:0.2", "media": "signed_url", "limit": 500}
classes, cursor = None, None
while True:
    page = requests.get(f"{ZENO}/api/v1/datasets/{DATASET}/labels",
                        headers=H, params={**params, **({"cursor": cursor} if cursor else {})}).json()
    if "error" in page:
        raise SystemExit(page["error"])
    classes = page["meta"]["classes"]
    for item in page["data"]:
        split = item.get("split", "train")
        (root / "images" / split).mkdir(parents=True, exist_ok=True)
        (root / "labels" / split).mkdir(parents=True, exist_ok=True)
        image = requests.get(item["media_url"]).content      # link valid 15 min
        (root / "images" / split / f"{item['asset_id']}.png").write_bytes(image)
        (root / "labels" / split / item["file"]).write_text("\n".join(item["lines"]) + "\n")
    cursor = page["next_cursor"]
    if not cursor:
        break

(root / "data.yaml").write_text(
    f"path: {root.resolve()}\ntrain: images/train\nval: images/val\nnames: {classes}\n")
# then: yolo train data=zeno-yolo/data.yaml model=yolov8n.pt
```

### COCO for Detectron2 / pycocotools

```python
coco = {"images": [], "annotations": [], "categories": None}
cursor = None
while True:
    page = requests.get(f"{ZENO}/api/v1/datasets/{DATASET}/labels", headers=H,
                        params={"format": "coco", "limit": 1000, **({"cursor": cursor} if cursor else {})}).json()
    coco["images"] += page["data"]["images"]
    coco["annotations"] += page["data"]["annotations"]
    coco["categories"] = page["data"]["categories"]
    cursor = page["next_cursor"]
    if not cursor:
        break
# pycocotools wants integer ids: map the stable string ids once.
image_ids = {img["id"]: i + 1 for i, img in enumerate(coco["images"])}
for img in coco["images"]:
    img["id"] = image_ids[img["id"]]
for i, ann in enumerate(coco["annotations"]):
    ann["id"], ann["image_id"] = i + 1, image_ids[ann["image_id"]]
```

### Incremental sync (nightly job)

```bash
# Only what was accepted since the last run.
curl -sH "Authorization: Bearer $ZENO_API_KEY" \
  "$ZENO/api/v1/datasets/$DATASET/labels/stream?since=$(cat .last_sync)&classes=cup,hand" \
  >> labels.jsonl && date -u +%FT%TZ > .last_sync
```

### Stream everything (Python)

```python
with requests.get(f"{ZENO}/api/v1/datasets/{DATASET}/labels/stream",
                  headers=H, params={"rename": "cup:mug"}, stream=True) as r:
    r.raise_for_status()
    for line in r.iter_lines():
        record = json.loads(line)   # one accepted record per line
```

### TypeScript

```ts
const res = await fetch(`${ZENO}/api/v1/datasets/${id}/labels?format=zeno&bbox=normalized&limit=200`, {
  headers: { Authorization: `Bearer ${process.env.ZENO_API_KEY}` },
});
const { data, next_cursor } = await res.json();
```
