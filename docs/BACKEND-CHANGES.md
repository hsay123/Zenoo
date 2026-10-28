# Backend changes (branch `wire-backend`)

All changes are additive and keep the existing 137 tests green. Final state:
`typecheck` ✅ · `lint` ✅ · `test` ✅ 171/171 · `next build` ✅.

## Baseline (imported, unchanged)
The complete backend now lives at `backend/` (git-renamed from `backend_1/backend`,
history preserved). No source logic was changed during the import.

## 1. Privy access-token verification (was a stub that always threw)
- `lib/env.ts`: added optional `PRIVY_VERIFICATION_KEY` (SPKI PEM from the Privy dashboard).
- `lib/auth/verifyToken.ts`:
  - replaced the `verifyPrivyToken` stub with real verification using
    `@privy-io/server-auth@1.32.5`'s `PrivyClient.verifyAuthToken`.
  - Verified contract (mirrors the SDK internals): **ES256** signature,
    `iss === "privy.io"`, `aud === PRIVY_APP_ID`, expiry. The DID comes from the
    token subject (`userId`).
  - When `PRIVY_VERIFICATION_KEY` is set, verification is fully local (no API call).
    Otherwise the SDK fetches the key from the Privy API with the app secret.
  - After verifying the DID, it best-effort fetches the linked email + wallet via
    `getUserById` (only when a real app secret is present); on any failure it
    falls back to DID-only. First login still auto-creates a `contributor`.
  - Privy clients are memoised in-process, keyed by `appId + appSecret` (the
    secret is never logged).
- New deps: `@privy-io/server-auth@1.32.5`, `jose@6.2.12`.
- Tests: `lib/auth/__tests__/privyVerify.test.ts` (8) — signs tokens with a
  **locally generated ES256 keypair** (no network) and covers valid, Bearer
  prefix, wrong key, expired, wrong audience, wrong issuer, malformed, and
  missing-app-id cases.

## 2. Roles
- `scripts/set-role.ts` (new): `npx tsx scripts/set-role.ts <email-or-did> <role>`
  using the service role; prints `old -> new` and the user id.
- `lib/validation/admin.ts` (new): `setRoleSchema`, `listUsersQuerySchema`.
- `app/api/admin/users/[id]/role/route.ts` (new): admin-only `PATCH` to change a
  role. Refuses self-demotion to avoid admin lock-out; 404 for unknown users.
- Note: `/api/me` already returns `role`, `wallet_address`, `email`, `status` and
  the contributor profile, which is what the UI needs to route by role. A
  `pseudonym` field does not exist in the schema and was intentionally not invented.

## 3. Buyer content pipeline (projects → assets → tasks)
Previously there was no way for a buyer to bring media into a job
(`POST /api/jobs` required an existing `project_id`).
- `lib/validation/content.ts` (new): `createProjectSchema`, `uploadUrlSchema`,
  `createAssetSchema` (image requires width+height; video requires duration_ms),
  `createTasksSchema`.
- `lib/content/repository.ts` (new): `toProject`, `toAsset`, `assertProjectAccess`,
  `objectKeyPrefix`, `assertObjectKeyInProject`, `loadProjectAssets`.
- `app/api/projects/route.ts` (new): `POST` (buyer) creates a project; `GET`
  (buyer own / admin all) lists them, paginated.
- `app/api/assets/upload-url/route.ts` (new): `POST` (buyer) mints a short-lived
  signed upload URL into the private bucket. Object keys are namespaced
  `projects/{project_id}/{uuid}-{safeName}` so an asset can never be registered
  against another project's prefix.
- `app/api/assets/route.ts` (new): `POST` (buyer) registers the uploaded object
  (modality, object_key, content_hash, dimensions/duration, consent_ref). Re-asserts
  the project prefix.
- `app/api/jobs/[id]/tasks/route.ts` (new): `POST` (owner buyer or admin) creates
  tasks for a **draft** job from asset ids. Asset modality must match the job
  modality. **Gold tasks (with `gold_answer`) are admin-only**, matching the PRD
  (buyers must not see or set ground truth).

## 4. Job lifecycle + claim guard
- `lib/jobs/lifecycle.ts` (new): `TRANSITIONS` + pure `assertTransition` (unit-tested)
  + atomic `transitionJob` (guarded by `.in("status", from)`).
- `app/api/jobs/[id]/pause|resume|close/route.ts` (new): owner buyer or admin.
  `published→paused`, `paused→published`, `{published|paused}→closed`.
- `lib/jobs/repository.ts`: added `getJobStatus(jobId)`.
- `app/api/tasks/[id]/claim/route.ts`: **fixed a real gap** — new claims are now
  refused with 409 unless the parent job is `published`. A contributor already
  holding a live lease is unaffected (existing lease short-circuit runs first).
- `/api/tasks/available` already filtered to published jobs, so pausing/closing a
  job already removed its tasks from the listing.

## 5. Admin reads
- `app/api/admin/users/route.ts` (new): admin-only paginated user list with
  `role` / `search` filters.
- Admin job listing is already served by `GET /api/jobs` (admin sees all jobs),
  so no duplicate `/api/admin/jobs` route was added.

## 6. Audit sample (commit-reveal)
**Not implemented.** It is marked optional in the brief and would need a new
table/migration (which cannot be applied — see `docs/BLOCKED.md`). Documented as a
known gap rather than half-built.

## Tests added
| File | Count | Covers |
|---|---|---|
| `lib/auth/__tests__/privyVerify.test.ts` | 8 | real token verification, negative cases |
| `lib/jobs/__tests__/lifecycle.test.ts` | 7 | `assertTransition` + 409 mapping |
| `lib/validation/__tests__/admin.test.ts` | 6 | role/list schemas |
| `lib/validation/__tests__/content.test.ts` | 13 | project/asset/task schemas + object-key guard |

Totals: **137 → 171 tests**, 18 → 19 files. All existing tests untouched and green.
