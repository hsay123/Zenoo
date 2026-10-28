# Runbook — Zeno (frontend + real backend)

## Ports
- Backend (API-only Next.js): **3010** (the unrelated `trapnet-dashboard` container owns :3001)
- Frontend (Next.js): **3000**
- Development is served over **HTTPS** on `localhost`. Sign-In with Ethereum's `domain` field is
  scheme-less and ERC-4361 defaults a missing scheme to `https`; Brave Wallet enforces that, so an
  `http://localhost` origin makes external-wallet login fail with a domain-mismatch warning.
- `FRONTEND_ORIGIN=https://localhost:3000` (backend CORS allow-list)
- The browser reaches the API same-origin at `/platform`; `next.config.ts` proxies that to
  `PLATFORM_API_URL` (`http://localhost:3010`). This keeps a single HTTPS origin (no mixed content).

## 1. Prerequisites (one-time)
1. **Database migrations — APPLIED (2026-10-12)** on `sfebambrdcfqrdmetflw` via the Supabase MCP server
   (`apply_migration` 001–006, then `notify pgrst, 'reload schema';`). To (re)apply on another project:
   the one-shot bundle is `backend/supabase/all_migrations.sql` — paste it in the Supabase SQL editor, or
   `cd backend && psql "$DATABASE_URL" -f supabase/all_migrations.sql`.
   Migration **006_security_hardening** revokes the default `anon`/`authenticated` grants on the public
   schema, pins the trigger function's `search_path`, closes the `rls_auto_enable` RPC surface, moves
   `pg_trgm` into `extensions`, and sets the `media` bucket limits below. Re-check it after any DB restore.
2. **Create a private Storage bucket named `media`** (Supabase → Storage → New bucket, public off) with
   `file_size_limit = 52428800` (50 MiB) and
   `allowed_mime_types = {image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime}` —
   applied by 006. Effective ceiling is `min(bucket, project global)`.
3. **Privy dashboard:** add `https://localhost:3000` to allowed origins; enable email login.
   Client config uses `supportedChains: [Monad testnet]` with **no `defaultChain`** so external
   wallets are not asked to switch chain during login (some wallets reject an unsupported testnet
   default chain).
5. **Trust the dev certificate (optional, removes the browser warning):** the `dev` script generates
   `certificates/localhost*.pem` (gitignored). Run `mkcert -install` once with sudo to trust the local
   CA; otherwise accept the self-signed certificate warning once in the browser.
4. Seed optional sample rows: `cd backend && npm run seed`.

## 2. Environment (variable names only — never commit values)
`backend/.env.local`:
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET        # default: media
FRONTEND_ORIGIN                # https://localhost:3000
PRIVY_APP_ID
PRIVY_APP_SECRET
PRIVY_VERIFICATION_KEY         # optional; SPKI PEM from the Privy dashboard (local verification)
DEV_AUTH_BYPASS                # must be false for any run that counts as evidence
LEASE_MINUTES
AI_CONFIDENCE_THRESHOLD
GOLD_IOU_THRESHOLD
GOLD_SEGMENT_MS_TOLERANCE
FAST_SUBMIT_THRESHOLD_SECONDS
JOB_ESCROW_ADDRESS             # optional (real settlement)
MONAD_RPC_URL                  # optional
```
Root `.env.local` (frontend, public only — see `.env.example`):
```
NEXT_PUBLIC_API_BASE_URL=/platform       # same-origin proxy path (see next.config.ts)
PLATFORM_API_URL=http://localhost:3010   # server-side target of the /platform rewrite (not public)
NEXT_PUBLIC_PRIVY_APP_ID=                # same public app id as the backend
```

## 3. Start
```bash
# Terminal 1 — backend
cd backend && PORT=3010 npm run dev
curl -s http://localhost:3010/api/health

# Terminal 2 — frontend
cd .. && npm run dev                        # https://localhost:3000 (generates a local cert on first run)
```

**Official Judge URL (hosted demo):** `https://zeno-web-app.vercel.app`
This is the canonical public URL for the Zeno hackathon demo. Do not change it.

## 4. Roles
- First Privy login creates a **contributor**.
- Promote each real account after its first login:
  ```bash
  cd backend
  npx tsx scripts/set-role.ts you+buyer@example.com buyer
  npx tsx scripts/set-role.ts you+reviewer@example.com reviewer
  npx tsx scripts/set-role.ts you+admin@example.com admin
  ```
- Or via API (as an admin): `PATCH /api/admin/users/{id}/role` `{ "role": "buyer" }`.
- Seeded (fixture) users already include one of each role.

## 5. Reset test data
- Re-run the idempotent seed: `cd backend && npm run seed`.
- Full reset: re-run `backend/supabase/all_migrations.sql` against a fresh database
  (the migrations create tables/enums from scratch), then `npm run seed`.

## 6. Tests / checks
```bash
# Backend
cd backend && npm run typecheck && npm run lint && npm test && npm run build
# Frontend
cd .. && npx tsc --noEmit && npx eslint src && npm test && npm run build
```
Test harness scripts (repo root):
```bash
node scripts/infra-check.mjs                # tables / bucket / auth-users readiness
node scripts/verify-login.mjs               # HTTPS origin + secure context + Privy modal opens
node scripts/verify-wallet-siwe.mjs         # SIWE domain/URI consistent with the origin
node scripts/db-assert.mjs counts           # per-table row counts (service role)
node scripts/db-assert.mjs user <email>
node scripts/capture-sessions.mjs buyer     # headed; saves playwright/.auth/buyer.json
```
E2E (Playwright, real stack, `DEV_AUTH_BYPASS=false`):
```bash
node scripts/capture-sessions.mjs <role>      # headed; saves playwright/.auth/<role>.json (gitignored)
npx playwright test e2e/s1-auth-roles.spec.ts # S1 — needs a captured contributor session
```

### Hosted Demo — Official Judge URL & Alias Update

**Official Judge URL:** `https://zeno-web-app.vercel.app` — **Do not change.**

This URL is kept pointing to the latest successful `release/rc-integration` Preview
deployment via the alias update script:

```bash
# Run after every successful release/rc-integration deployment
node scripts/update-zeno-web-app-alias.js
```

The script verifies health (`/` and `/platform/api/health` → HTTP 200), updates the
alias, and confirms the rewrite and Privy login work.

Verification after alias update:
```bash
curl -sS -w "http=%{http_code}" https://zeno-web-app.vercel.app/
curl -sS -w "http=%{http_code}" https://zeno-web-app.vercel.app/platform/api/health
# Both must return HTTP 200
```

## 7. What is mock vs real
| Thing | State |
|---|---|
| Privy token verification | **Real** (ES256, issuer/audience/expiry) — unit-tested locally |
| Projects / assets / tasks / job lifecycle / roles / admin | **Real** code, DB-backed |
| Database schema | **Applied** on `sfebambrdcfqrdmetflw` — migrations 001–006, RLS on every table, anon/authenticated revoked (service-role only) |
| Storage bucket | **Created** — private `media` bucket; 50 MiB limit; PNG/JPEG/WebP + MP4/WebM/QuickTime only |
| Settlement | **Mock** while `is_mock=true`; receipts must show "Mock settlement, no onchain transaction" |
| Frontend product screens | **Real** — screens fetch the token-bound platform client (`src/lib/api/platform.ts`), no interface preview |
| AI reviewer | Mock reviewer unless an AI key is configured |
