# E2E Evidence — PhysicalData (real backend, no mocks)

Branch: `wire-backend` · Frontend: <https://localhost:3000> (HTTPS) · Backend: <http://localhost:3010>
`DEV_AUTH_BYPASS=false` · Supabase project: `sfebambrdcfqrdmetflw.supabase.co`

Every row below is a command that was actually run and the output that came back. Nothing here is
fabricated. A slice is only marked **GREEN** when a real session drives it end to end.

---

## Pre-flight (Phase 0)

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| Backend health | `curl :3010/api/health` | `{"data":{"status":"ok",…}}` HTTP 200 | ✅ |
| Frontend boots | `curl :3000/login` | HTTP 200, page renders (Privy referenced) | ✅ |
| Auth bypass off | `grep DEV_AUTH_BYPASS backend/.env.local` | `false` | ✅ |
| Privy app credentials | `PrivyClient.getAppSettings()` | app `cmv2vvueq01hu0gjju69ht0wf` ("Metropolis"), emailAuth on, verification key present | ✅ |
| Privy browser wiring | `node scripts/verify-login.mjs` | `/login` over **https**, `window.isSecureContext=true`, Sign-in opens the Privy modal; 0 console/page errors | ✅ |
| Privy **test credentials** | `PrivyClient.getTestAccessToken()` | `Test credentials not enabled for this app` | ⚠️ browser login required |
| Storage bucket `media` | `GET /storage/v1/bucket` | exists, `public:false` | ✅ |
| DB schema | Supabase MCP `apply_migration` 001–005 + `notify pgrst,'reload schema'` | 14 tables, 8 enums, RLS on; `list_migrations` complete | ✅ |
| Same-origin API proxy | `curl -k :3000/platform/api/health` | `{"data":{"status":"ok",…}}` HTTP 200 (proxied to :3010) | ✅ |
| External-wallet origin (fix A) | `node scripts/verify-wallet-siwe.mjs` | SIWE `domain=localhost:3000`, `URI=https://localhost:3000`, origin https → **PASS** | ✅ |
| Email-session fetch (fix B) | `npm test` (vitest) | `fetch` bound to `globalThis`; no `Illegal invocation`; test fails on the pre-fix code | ✅ |

`scripts/infra-check.mjs` output (after migration, 2026-10-12):

```
PASS tables        all 9 required tables present
PASS bucket        'media' exists (private)
WARN auth users    none (log in via Privy to create the first user)
INFRA READY
```

**Conclusion:** the schema is applied and `public` exposes the tables (service-role only; no anon GRANTs).
The next dependency is a real Privy login to create the first `users` row (B3 — test credentials not
enabled, B4 — allowed origin). Dev servers were restarted after an OpenCode session reload on 2026-10-12
and re-verified: `/login` HTTP 200, `/platform/api/me` HTTP 401, `verify-login.mjs` → 0 console/page errors.

---

## Auth-bug fixes (A: wallet origin, B: email session fetch)

### A — External-wallet origin mismatch

**Diagnosis (real browser trace).** Privy's SIWE message uses a scheme-less `domain`
(`window.location.host`) and sets `URI` to `window.location.origin`. ERC-4361 says a missing scheme
defaults to `https`, and Brave Wallet enforces it — so on an `http://localhost:3000` origin Brave
reported the request as `https://localhost:3000` ("a different domain from the current origin") and
the login failed. Nothing in the app config referenced `https://localhost`; the scheme came from the
ERC-4361 default. **Fix:** serve the dev app over HTTPS so the origin matches, and proxy the API
same-origin (`/platform`) to avoid mixed content.

`node scripts/verify-wallet-siwe.mjs` (injected EIP-6963 "Brave Wallet", real Privy modal):

```json
{
  "origin": "https://localhost:3000",
  "siweDomain": "localhost:3000",
  "siweUri": "https://localhost:3000",
  "checks": { "originIsHttps": true, "schemeLessDomainMatchesHost": true, "uriMatchesOrigin": true }
}
PASS — SIWE domain/URI are consistent with the HTTPS dev origin.
```

The encoded `personal_sign` payload decoded to:

```
localhost:3000 wants you to sign in with your Ethereum account:
0x1111…
URI: https://localhost:3000
Version: 1
Chain ID: 10143
```

### B — Email login: `Failed to execute 'fetch' on 'Window': Illegal invocation`

**Diagnosis.** `PlatformClient` stored the global `fetch` unbound and called it as a method
(`this.fetchImpl(...)`), so the browser invoked `window.fetch` with the client as receiver and threw
`Illegal invocation` (wrapped as `NETWORK`). **Fix:** bind once in the constructor
(`(opts.fetchImpl ?? globalThis.fetch).bind(globalThis)`).

Regression test `src/lib/api/platform.test.ts` (vitest) installs a brand-checking global fetch that
reproduces the browser behaviour: it **fails with `NETWORK` on the pre-fix code** and passes with
the fix. `npm test` → 4 passed; backend `npm test` → 174 passed.

### C — Wallet login: duplicate `privy_did` race + external-wallet chain prompt

**Symptom (backend log, 2026-10-12):** a real wallet login authenticated fine with Privy, then the
backend failed on user creation:

```
[API Error] Error: Failed to create user: duplicate key value violates unique constraint "users_privy_did_key"
    at loadOrCreateUserByPrivyDid (lib/auth/verifyToken.ts:138:26)
[frontend log] [browser] Error authenticating session  (x3)
```

`loadOrCreateUserByPrivyDid` did a raw SELECT-then-INSERT: on a fresh login the browser can fire more
than one `/api/me`, both SELECT-miss the still-absent `users` row, then both INSERT — the loser hits
`users_privy_did_key` and the session dies. **Fix:** on a duplicate-key insert error the loser
re-reads the winner's row and returns it instead of failing. Regression test
`backend/lib/auth/__tests__/userCreateRace.test.ts` (3 tests: create / race-recovery / rethrow) —
backend suite now **174 passed**.

**Second cause (Privy docs):** the app set `defaultChain: monadTestnet` (chain 10143). Per
docs.privy.io, that makes Privy prompt external wallets to switch to the default chain on login, and
*some wallets reject the connection outright when an unsupported testnet is the default chain*.
**Fix:** `PrivyProvider` now sets `supportedChains: [monadTestnet]` with **no `defaultChain`** —
external wallets log in on whatever chain they are on (no switch prompt), while embedded wallets
still start on Monad testnet (`supportedChains[0]`).

Re-verified with `scripts/verify-wallet-siwe.mjs` (real Privy modal, mock wallet): SIWE
`domain=localhost:3000`, `URI=https://localhost:3000`, **Chain ID: 1** (the wallet's own chain — no
switch is requested anymore); all checks **PASS**.

---

## S1 — Auth & roles

Status: **GREEN** (2026-10-12). Real Privy sessions are now captured **without manual interaction**:
`scripts/capture-session-auto.mjs <role>` announces a mock EIP-6963 wallet whose signatures are produced
by a local secp256k1 key via `viem` (real signatures → real Privy session), then saves
`playwright/.auth/<role>.json` (gitignored). Four distinct wallet users exist — buyer / contributor /
reviewer / admin — each promoted with `backend/scripts/set-role.ts <wallet-address> <role>`.

`e2e/s1-auth-roles.spec.ts` against the real stack (`DEV_AUTH_BYPASS=false`):

```
$ npx playwright test e2e/s1-auth-roles.spec.ts
Running 5 tests using 1 worker
  ✓ 1  sends /workspace visitors to /login                              (1.1s)
  ✓ 2  resolves the real profile and lands on the contributor workspace (2.5s)
  ✓ 3  session persists across a reload                                 (2.5s)
  ✓ 4  role gate: contributor cannot open the buyer workspace           (2.5s)
  ✓ 5  sign out ends the session and returns to /login                  (2.5s)
5 passed (11.1s)
```

Evidence: the workspace resolves the live profile from `GET /api/me` (the shell renders `… · contributor`);
role gating is real (a contributor is bounced out of `/workspace/buyer`); sign-out returns to `/login`.

## S2 — Buyer project + upload + tasks + publish

Status: **GREEN** (2026-10-12). `e2e/s2-buyer-job.spec.ts` drives the real creation wizard with the buyer
session and the `e2e/fixtures/sample.png` fixture (640×480), then proves ownership enforcement:

```
$ npx playwright test e2e/s2-buyer-job.spec.ts
Running 2 tests using 1 worker
  ✓ 1  publishes a job from real media and generates tasks   (90s budget)
  ✓ 2  rejects a non-owner reading the buyer's job           403 FORBIDDEN
2 passed
```

Persistence verified directly in Supabase (`execute_sql`, service role / MCP):

| Row | Evidence |
| --- | --- |
| `projects` | `name = E2E robotics intake …`, `data_rights = "E2E-owned capture; buyer holds all rights…"`, `retention_policy` recorded, `buyer_id` = the buyer user |
| `jobs` | `status = published`, `modality = image`, `reward_per_task = 5`, `budget = 100`, `label_list = [cup, red_block, blue_block, other]`, `schema_version_id = a0000000-…-0001` (image-boxes-v1) |
| `tasks` | 1 row, `status = available`, `is_gold = false`, no lease |
| `assets` | `modality = image`, real SHA-256 `content_hash = d76fa7fc…`, `width = 640`, `height = 480`, `object_key` under the project prefix |

Ownership: `GET /api/jobs/{id}` with a contributor token → **403 `FORBIDDEN`** (`loadJobForActor`).

## S3 — Contributor claim + annotate + submit

Status: **GREEN** (2026-10-12). `e2e/s3-contributor-claim.spec.ts` builds its own fixture over the real
API (buyer token: project → two uploaded video assets → published job → two tasks) and then drives the
contributor session:

```
$ npx playwright test e2e/s3-contributor-claim.spec.ts
Running 2 tests using 1 worker
  ✓ 1  claims a task, saves a draft, then submits it        (real queue -> claim -> draft -> submit)
  ✓ 2  two contributors cannot claim the same task twice     (one 200 / one 409)
2 passed
```

Persistence + invariants verified in Supabase (`execute_sql`):

| Check | Evidence |
| --- | --- |
| Draft then submit | `task 67c556ab…` → `status = submitted`, `lease_owner = null`; one append-only `submissions` row `version = 1`, `schema_version = action-segments-v1`; the `task_drafts` row was cleared on submit |
| Atomic claim | `task ed48afea…` → `status = claimed` with exactly **one** `lease_owner`; the losing racer got `409` (`UPDATE … WHERE status = 'available'` matched zero rows) |
| Fast-submit flag | the fast submission is recorded (`is_fast_flag = true`), routing it to the human queue |

Fix surfaced by the slice: submitting releases the lease, so `GET /api/tasks/{id}` now also admits a
contributor who has already submitted to the task (read-only review of their own version), and
`useClientQuery` keeps last-good data during a reload so the success state is not blanked.


## S4 — Review → correction → appeal

Status: **GREEN** (2026-10-12). `e2e/s4-reviewer-lifecycle.spec.ts` builds a published video job over the
real API, has a real contributor claim + submit version 1, then runs the full lifecycle across two roles:

```
$ npx playwright test e2e/s4-reviewer-lifecycle.spec.ts
Running 6 tests using 1 worker
  ✓ 1  reviewer requests a revision for version 1        (human revise / IMPRECISE_TIMING)
  ✓ 2  contributor corrects the annotation and resubmits as version 2
  ✓ 3  reviewer rejects version 2                        (human reject / RUBRIC_VIOLATION)
  ✓ 4  contributor files an appeal against the rejected version
  ✓ 5  reviewer upholds the appeal and the task becomes accepted
  ✓ 6  a contributor cannot record a review decision      (403; 401 unauthenticated)
6 passed
```

Persistence + invariants verified in Supabase (`execute_sql`) for task `cd1cbc83…`:

| Check | Evidence |
| --- | --- |
| Append-only corrections | two `submissions` rows: `v1` (label `reach`, fast flag) and `v2` (label `grasp`); the resubmit changed the payload, so it was not a `422 DUPLICATE_PAYLOAD` |
| Human decisions | `reviews`: `revise` / `IMPRECISE_TIMING` (human, on v1); `reject` / `RUBRIC_VIOLATION` (human, on v2) |
| Appeal lifecycle | `appeals`: one row, `status = accepted`, `adjudicator_id` = the reviewer, resolution notes recorded; the original submission + review stay immutable |
| Uphold outcome | `reviews`: `accept` / `APPEAL_UPHELD` (human, on v2); task `status = accepted`, `lease_owner = null` |
| Role boundary | `POST /api/reviews/{id}/decision` with a contributor token → **403 `FORBIDDEN`**; no token → **401** |

Fixes surfaced by the slice:

- Submissions are append-only, so after a revision request every historical version of a task matched
  `task.status = 'submitted'` and the queue listed the same task once per version (a reviewer could open a
  stale one). `listSubmittedQueue` now keeps only the latest version per task before paginating; the rule
  is extracted to `backend/lib/review/queue.ts` and pinned by `backend/lib/review/__tests__/queue.test.ts`.
- Recording a decision reloads the queue, which removes the task — the console's "not in your queue" guard
  was masking the "Decision recorded" confirmation. The success state now renders before that guard.
- The appeals queue intentionally exposes only open appeals, so a decided appeal vanished after
  adjudication. The disputes screen now shows the outcomes recorded in the visit above the list (and the
  second stat reads "Resolved this session" instead of implying it includes decided appeals the endpoint
  does not return).

## S5 — Receipt + export

Status: **GREEN** (2026-10-12). `e2e/s5-receipts-export.spec.ts` builds a published two-task video job
over the real API, has a real contributor claim + submit one task, a real reviewer accept it, and a real
admin settle it. Video always routes to human review, so the accepted set is deterministic:

```
$ npx playwright test e2e/s5-receipts-export.spec.ts
Running 5 tests using 1 worker
  ✓ 1  buyer export contains only the accepted version, with provenance and no identity
  ✓ 2  buyer streams a real file download from the export screen
  ✓ 3  settlement writes a public mock receipt
  ✓ 4  contributor earnings labels the payout as mock and links to its receipt
  ✓ 5  role boundaries: contributor cannot export or settle, anonymous cannot read
5 passed
```

Persistence + invariants verified in Supabase (`execute_sql`):

| Check | Evidence |
| --- | --- |
| Accepted-versions-only export | job has two tasks; only the accepted one is exported (`record_counts.total = 1`, `video = 1`), and the still-open second task id is absent from the body |
| No contributor identity | the export body does not contain the contributor's user id (checked against `GET /api/me`) |
| Real streamed download | the export screen's Download button produces a Playwright `download` event (`job-<id>-export.json`) |
| Settlement record | `receipts`: one row, `is_mock = true`, `tx_hash = 0x9af579…`, `annotation_hash` = the submission `payload_hash`, `review_ref` = the accepting review |
| Task settled | task `status = paid`, `lease_owner = null`; the untaken sibling task stays `available` |
| Public receipt | `GET /api/receipts/{id}` with **no** token → `200`; the receipt page renders anonymously |
| Role boundary | contributor → `GET /api/jobs/{id}/export` **403**, `POST /api/settlement/accept` **403**; anonymous export **401**; anonymous receipt **200** |

Product changes:

- New public receipt screen at `/receipts/{id}` (`src/components/receipts/PublicReceipt.tsx`), reading the
  real receipt through a new session-free `usePublicQuery`. A mocked payout is labelled **Mock settlement**
  with the note that the reference is a deterministic mock hash, never an on-chain transaction; a real
  chain settlement (when configured) is labelled as on-chain.
- `ContributorEarnings` now labels a mocked payout **Mock settlement** (previously a mock hash was shown as
  "on-chain", which was wrong) and links each settled row to its receipt. Earnings rows carry
  `receipt_id` + `settlement_is_mock` (additive reads; the schema is unchanged).
- `live.ts` factors the query runner into `useQueryWithClient` so authenticated (`useClientQuery`) and
  public (`usePublicQuery`) reads share the same stale-while-revalidate behaviour.

## S6 — Lifecycle + admin

Status: **GREEN** (2026-10-12). `e2e/s6-lifecycle-admin.spec.ts` builds two published video jobs over the
real API and drives the buyer job screen plus the new admin screen. A dedicated throwaway account
(`s6target`, captured with `scripts/capture-session-auto.mjs`) is the role-reassignment subject so no
existing account is ever left changed:

```
$ npx playwright test e2e/s6-lifecycle-admin.spec.ts
Running 6 tests using 1 worker
  ✓ 1  buyer pauses, resumes and closes a published job from the job screen
  ✓ 2  an illegal lifecycle transition is refused (409)
  ✓ 3  lifecycle role boundaries: contributor 403, anonymous 401, admin allowed
  ✓  4  admin reads are admin-only: contributor 403, anonymous 401, admin 200
  ✓  5  the admin screen reassigns a role and the change persists
  ✓  6  self-demotion is refused and a non-admin is kept out of /workspace/admin
6 passed
```

Persistence + invariants verified in Supabase (`execute_sql`) and against the live API:

| Check | Evidence |
| --- | --- |
| Lifecycle (buyer UI) | the buyer walked `published → paused → published → closed` from the job screen; DB shows the lifecycle job `status = closed` |
| Lifecycle (admin) | admin paused and resumed a second published job (`POST /jobs/{id}/pause` → `paused`, `/resume` → `published`); DB shows it back at `published` |
| Illegal transition | `pause`/`resume` on the now-closed job → **409 `CONFLICT`** (the guarded state machine) |
| Lifecycle boundary | contributor → `POST /jobs/{id}/pause` **403**; anonymous → **401**; admin → **200** |
| Admin reads | contributor → `GET /admin/users` **403**; anonymous **401**; admin **200** |
| Role write | the admin screen reassigned the throwaway account `contributor → reviewer` and back; each write confirmed through `GET /admin/users`, and the account's final DB `role` is `contributor` |
| Self-demotion | admin `PATCH /admin/users/{self}/role {role:"buyer"}` → **400 `BAD_REQUEST`** |
| Shell guard | a contributor sent to `/workspace/admin` lands on `/workspace/contributor` |

Product changes:

- New admin workspace section: `workspaceRoles.admin` (`/workspace/admin`) plus the shell tab and the
  non-admin redirect. `/workspace` now sends each role to `workspaceRoles[role].home`, so an admin lands on
  the admin surface.
- `AdminUsers` (`src/components/product/AdminUsers.tsx`) reads the real admin-only `GET /api/admin/users`
  and reassigns roles through the real `PATCH /api/admin/users/{id}/role`; the API's self-demotion guard
  surfaces inline rather than being hidden in the UI.

Known gap (unchanged): there is **no separate admin action log** in this build, and the optional VRF
commit-reveal **audit sample** remains unimplemented (the `audit_samples` table exists but the feature needs
an oracle/funded key). The audit trail the product does have is the append-only review, appeal and
payout-receipt record. This is stated in the admin screen itself, not left implicit.
