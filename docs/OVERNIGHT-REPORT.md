# Overnight report — PhysicalData backend wiring

**Branch:** `wire-backend` · **Run:** interactive (not the unattended window) · **Date:** 2026-10-12

## TL;DR
The **backend is now real where it can be, and fully green** (typecheck, lint,
171 tests, `next build`). The **two hard blockers are environmental**, not code:
the database schema has never been applied and there are no Privy test sessions,
so no end-to-end slice can run or be verified yet. The frontend's real API client
and contract are in place; switching the screens over is the next large slice.

| Phase | Status | Evidence |
|---|---|---|
| 0 Pre-flight | ✅ done | env/tools probed; `all_migrations.sql`, `BLOCKED.md`, scripts written |
| 1 Import backend | ✅ done | `backend/` in place; baseline 137 tests green |
| 2 Backend gaps | ✅ mostly done | Privy verify, roles, content pipeline, lifecycle, admin reads; **171** tests; build ✅ |
| 3 Frontend wiring | 🟡 partial | `src/lib/api/platform.ts` (real client + zod schemas), `.env.example`; screens not yet switched |
| 4 E2E S1–S7 | ⛔ blocked | no DB schema, no Privy sessions (see BLOCKED B1/B3) |
| 5 Chain | ⛔ not started | no funded testnet key; contract work untouched |
| 6 Hardening + report | ✅ done | this file, RUNBOOK, BACKEND-CHANGES, API-CONTRACT |
| 7 Finalize | ✅ commit+push | committed on `wire-backend`, pushed to `origin/wire-backend`; **no shutdown** (interactive) |

## What is real now
- **Privy verification** (`lib/auth/verifyToken.ts`): ES256 signature, `iss=privy.io`,
  `aud=PRIVY_APP_ID`, expiry, DID from subject, best-effort email/wallet via the
  server SDK. Unit-tested with a locally generated keypair (8 tests, no network).
- **Roles**: `scripts/set-role.ts` + admin-only `PATCH /api/admin/users/{id}/role`.
- **Buyer content pipeline**: `POST/GET /api/projects`, `POST /api/assets/upload-url`,
  `POST /api/assets`, `POST /api/jobs/{id}/tasks` (gold = admin-only).
- **Job lifecycle**: `pause`/`resume`/`close`; **claim route fixed** to refuse new
  claims on paused/closed jobs.
- **Admin reads**: `GET /api/admin/users`.
- **Frontend contract**: `src/lib/api/platform.ts` — zod-parsed envelopes, bearer
  token provider, idempotency keys, 15 s timeout, `PlatformError` code mapping.

## Open issues by severity
1. **BLOCKER (B1)** — DB schema not applied; no `DATABASE_URL`. Nothing DB-backed runs.
2. **BLOCKER (B2)** — `media` storage bucket does not exist.
3. **BLOCKER for automated E2E (B3)** — no Privy test accounts / saved sessions.
4. **HIGH** — frontend screens still render the labelled *interface preview*; they
   must be switched to `platform.ts` and the preview/mock layer removed (Phase 3.2–3.5).
   This is the largest remaining slice and is unverifiable until B1/B3 clear.
5. **MEDIUM** — settlement is mock (`is_mock=true`); UI must label it, never call it
   on-chain. Real path needs a funded testnet key (Tier 2).
6. **LOW** — audit sample (commit-reveal) not implemented (needs a migration; B1).
7. **LOW** — frontend has no Privy SDK yet (`@privy-io/react-auth`); login UI is still
   the preview flow.

## What you must do (in order, exact commands)
1. **Apply migrations** — see `docs/BLOCKED.md` B1:
   - easiest: paste `backend/supabase/all_migrations.sql` into the Supabase SQL editor; **or**
   - `cd backend && psql "$DATABASE_URL" -f supabase/all_migrations.sql`
     (add `DATABASE_URL` to `backend/.env.local` first).
2. **Create the private `media` bucket** (BLOCKED B2).
3. **Privy dashboard**: add `http://localhost:3000` to allowed origins (BLOCKED B4).
4. **Privy sessions** (BLOCKED B3) — either enable test accounts and fill
   `backend/.env.test.local` (`TEST_ACCOUNTS`, `PRIVY_TEST_OTP`), or run
   `node scripts/capture-sessions.mjs` and log in once per role.
5. **Seed** (optional): `cd backend && npm run seed`.
6. **Start**: `cd backend && npm run dev -- -p 3001` and, in another terminal,
   `npm run dev` (frontend, :3000). Check `curl http://localhost:3001/api/health`.
7. Then tell me what's red. The next slice is Phase 3 screen wiring + Phase 4 E2E.

## Honest limits
- I ran **no** end-to-end slice: the DB and Privy sessions did not exist, so any
  claim of a working golden path would be fabricated. Everything above that is
  marked "real" is covered by unit tests or a production build, not by a live request.
- I did not spin up a substitute local database: the brief says, without a
  `DATABASE_URL`, to document the blocker and continue.
- I did not touch a chain key, deploy a contract, or move any value.
- I did not shut the machine down (this was an interactive run, not the unattended
  window), and I made no changes outside this repository.
- The screens were deliberately **not** rewritten against the real API in this pass:
  doing so blind (no DB to verify against) risks turning a clean, labelled preview
  into broken unverified UI. The contract + client are ready for that pass.

## Verification run (all green)
```
backend:  npm run typecheck ✅   npm run lint ✅   npm test ✅ 171/171   npm run build ✅ (32 routes)
frontend: npx tsc --noEmit ✅
git:      branch wire-backend; secret scan clean; see commit message
```
