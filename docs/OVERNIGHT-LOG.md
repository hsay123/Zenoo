# Overnight run log — PhysicalData backend wiring

## Clock
- Started: 2026-10-12 ~11:25 IST
- HARD_STOP: 2026-10-12 17:30 IST
- Phase budget (scaled to the window above): Phase 0 20m; Phase 1 20m; Phase 2 70m; Phase 3 90m; Phase 4 120m; Phase 5 120m (conditional); Phase 6 40m; Phase 7 25m.
- Priority when short: 0 → 1 → 2 → 3 → 4 → 6 → 5.

## Decisions (safest option, one line of reasoning each)
1. **Backend location.** The complete backend already existed at `backend_1/backend` and was fully tracked.
   I `git mv`-ed it to the canonical `backend/` path and removed the now-empty `backend_1/`, because the
   prompt's scripts/READMEs all assume `backend/` and a duplicate tree would double-lint and confuse tooling.
   History is preserved by the rename; recoverable with `git mv backend backend_1/backend`.
2. **Frontend/backend isolation.** Added `backend/**` to the root ESLint ignores and `backend` to the root
   `tsconfig.json` exclude, because the root Next.js project otherwise tries to typecheck/lint the nested
   backend with incompatible settings.
3. **Database is blocked.** Supabase is reachable with the service-role key, but `public.users` does not
   exist (PostgREST `PGRST205`) and the `media` bucket does not exist. There is no `DATABASE_URL`, and the
   service-role JWT cannot run DDL over PostgREST (`/pg/query` returns 404). Per Phase 0.3 I generated
   `backend/supabase/all_migrations.sql`, wrote `docs/BLOCKED.md`, and am not doing DB-dependent work.
4. **No local-Supabase substitute.** I deliberately did NOT spin up a local Supabase via Docker. The prompt
   is explicit that when there is no `DATABASE_URL` I should document the blocker and continue, and the
   hosted project (with the real Privy app) is the intended target.
5. **No chain work without a key.** `.env.local` has no `DEPLOYER_PRIVATE_KEY` /
   `SETTLEMENT_SIGNER_PRIVATE_KEY`. Foundry 1.4.1 IS installed, so the contracts can be written and tested
   fully against a local anvil (Tier 3, only if Tier 1 finishes).
6. **No shutdown.** This run is interactive, not the unattended window. I will not power off the machine.

## Environment (verified)
- node v22.23.2, npm 10.9.8, git 2.53.0, ffmpeg 8.1.2, psql 18.4, forge 1.4.1, pnpm 10.33.2, Docker 29.7.2 (daemon up).
- Supabase REST reachable; PostgREST v14.18; schema `public` present but empty.
- Backend deps include `@supabase/supabase-js`, `viem`, `zod`, `rate-limiter-flexible`, `uuid`.
- Backend baseline: `typecheck` ✅, `lint` ✅, `test` ✅ 137/137.

## Progress
- [x] Phase 0 — pre-flight, blocker docs, migration bundle.
- [x] Phase 1 — branch `wire-backend`, backend relocated, baseline green (137 tests).
- [x] Phase 2 — backend gaps: Privy verification, roles, content pipeline, job lifecycle, admin reads. 171 tests; `next build` ✅. Audit sample (2.6) skipped (needs a migration; DB blocked).
- [~] Phase 3 — started: real client `src/lib/api/platform.ts` + zod schemas + `.env.example`. Screen wiring (3.2–3.5) remains; unverifiable without a DB/Privy sessions.
- [ ] Phase 4 — E2E (blocked by DB + Privy sessions).
- [ ] Phase 5 — chain (no funded testnet key; not started).
- [x] Phase 6 — hardening docs: BACKEND-CHANGES, API-CONTRACT, RUNBOOK, OVERNIGHT-REPORT.
- [x] Phase 7 — committed on `wire-backend` and pushed to `origin/wire-backend` (non-interactive, secret scan clean); **no shutdown** (interactive run).

## Additional decisions
7. **Frontend integration boundary.** Rather than blind-rewriting ~20 screens
   against a database that does not exist, I delivered the verified foundation
   (`src/lib/api/platform.ts`, zod schemas, error mapping, idempotency, timeout)
   and left the labelled interface preview intact. A blind rewrite would trade a
   clean preview for unverifiable UI. The screen switch + mock removal is the next slice.
8. **`zod` added to the frontend** (zod@4.6.6) specifically to parse responses at
   the client boundary, as the brief requires; no other library was added.
9. **Audit sample (2.6) skipped** — it needs a new table/migration, and migrations
   cannot be applied (B1). Documented rather than half-built.
10. **Live API left OFF by default.** `src/lib/api/{client,read}.ts` flip from the
    labelled preview to "live" the moment `NEXT_PUBLIC_API_BASE_URL` is set. Because
    the screens are not yet switched to `platform.ts`, enabling it now would replace
    a clean preview with empty/error states. So the flag is **commented out** in the
    local `.env.local` (gitignored) and documented in `.env.example`/RUNBOOK: turn it
    on together with the Phase 3.2–3.5 screen wiring, once the DB is up.
