# API contract (real backend)

Derived from the running code in `backend/` (`app/api/**`, `src/types/api.ts`,
`lib/api/response.ts`). Envelope, auth, CORS, and error codes are global.

## Global conventions
- **Base URL (dev):** `http://localhost:3010` · **Frontend origin:** `https://localhost:3000`
  (set via `FRONTEND_ORIGIN`; CORS allow-lists exactly this origin). In the browser the API is reached
  same-origin at `/platform` and proxied to the backend by `next.config.ts` (HTTPS avoids mixed content).
- **Success envelope:** `{ "data": ... }`
- **Error envelope:** `{ "error": { "code": string, "message": string, "details"?: unknown } }`
- **Error codes → status:** `BAD_REQUEST` 400 · `UNAUTHORIZED` 401 · `FORBIDDEN` 403 ·
  `NOT_FOUND` 404 · `CONFLICT` 409 · `VALIDATION_ERROR` 422 · `RATE_LIMIT` 429 ·
  `INTERNAL_ERROR` 500.
- **Auth:** `Authorization: Bearer <Privy access token>`. In dev only, if
  `DEV_AUTH_BYPASS=true`, `x-dev-user-id: <uuid>` is accepted instead. `true` is
  forbidden in production.
- **Idempotency:** `Idempotency-Key: <string>` on claim / draft / submit / decision /
  appeal / settlement-accept. Replays return the first stored response.
- **CORS:** allows `GET, POST, PUT, PATCH, DELETE, OPTIONS` and the headers
  `Content-Type, Authorization, x-dev-user-id, Idempotency-Key`.
- **Pagination:** `?page=` (1-based) and `?per_page=` (≤100, default 20) →
  `{ items, total, page, per_page }`.

## Auth & profile
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/me` | any | `CurrentUser` = user + contributor profile |
| GET | `/api/health` | public | liveness |

## Buyer content pipeline
| Method | Path | Roles | Body / notes |
|---|---|---|---|
| POST | `/api/projects` | buyer | `{ name, data_rights?, retention_policy? }` → `Project` |
| GET | `/api/projects` | buyer, admin | paginated `Project[]` (buyer: own) |
| POST | `/api/assets/upload-url` | buyer | `{ project_id, modality, filename, content_type? }` → `{ upload_url, object_key, token, method }` |
| POST | `/api/assets` | buyer | `{ project_id, modality, object_key, content_hash, size_bytes?, duration_ms?, width?, height?, consent_ref? }` → `Asset`. Image needs width+height; video needs duration_ms. `object_key` must start with `projects/{project_id}/`. |
| POST | `/api/jobs/{id}/tasks` | buyer(owner), admin | `{ asset_ids[], is_gold?, gold_answer? }` → `Task[]`. Job must be `draft`; asset modality must equal job modality; gold is admin-only. |

## Jobs
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/jobs` | buyer | `CreateJobRequest` → `Job` (draft) |
| GET | `/api/jobs` | buyer, admin | paginated `Job[]` (filters: status, modality, project_id) |
| GET | `/api/jobs/{id}` | buyer(owner), admin | `Job` |
| POST | `/api/jobs/{id}/publish` | buyer(owner) | `draft → published` |
| POST | `/api/jobs/{id}/pause` | buyer(owner), admin | `published → paused` |
| POST | `/api/jobs/{id}/resume` | buyer(owner), admin | `paused → published` |
| POST | `/api/jobs/{id}/close` | buyer(owner), admin | `{published,paused} → closed` |
| GET | `/api/jobs/{id}/export` | buyer(owner), admin | accepted-only export (JSONL/CSV + manifest) |

## Contributor tasks
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/tasks/available` | contributor | paginated `Task[]`; only published jobs; expired leases released |
| GET | `/api/tasks/{id}` | contributor | `Task` incl. `signed_media_url` (5-min TTL) |
| POST | `/api/tasks/{id}/claim` | contributor | → `{ task_id, lease_expiry, signed_media_url }`; 409 unless job `published`; idempotent; rate-limited |
| PUT | `/api/tasks/{id}/draft` | contributor | autosave → `{ task_id, saved_at }`; idempotent |
| POST | `/api/tasks/{id}/submit` | contributor | validates payload → `Submission`; idempotent |

## Review
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/review/queue` | reviewer, admin | paginated `ReviewQueueItem[]` |
| POST | `/api/reviews/{submissionId}/decision` | reviewer, admin | `{ decision, reason_code, confidence?, notes?, rubric_version? }`; idempotent |
| GET | `/api/review/appeals/queue` | reviewer, admin | paginated `AppealQueueItem[]` |
| POST | `/api/submissions/{id}/appeal` | contributor | `{ reason }` → `Appeal`; idempotent |
| POST | `/api/appeals/{id}/decision` | reviewer, admin | resolve an appeal |

## Settlement & earnings
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/settlement/accept` | reviewer, admin | creates a `Receipt`; `is_mock=true` until real on-chain settlement exists |
| GET | `/api/receipts/{id}` | public | `PublicReceipt` (no auth) |
| GET | `/api/earnings` | contributor | `EarningsSummary` (accepted vs paid are distinct) |

## Admin
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/admin/users` | admin | paginated `User[]`; filters `role`, `search` |
| PATCH | `/api/admin/users/{id}/role` | admin | `{ role }` → `User`; self-demotion refused |

## Frontend client
`src/lib/api/platform.ts` implements this contract: zod-parsed envelopes, bearer
token provider, `Idempotency-Key`, 15 s timeout, and a `PlatformError` whose
`code` maps 401→UNAUTHORIZED (re-auth), 403→FORBIDDEN (role banner),
409→CONFLICT (idempotent success), 429→RATE_LIMIT (backoff), network→NETWORK/OFFLINE.
