# Zeno

A two-app monorepo for physical-world annotation. The MVP supports **images**
(bounding boxes, `image-boxes-v1`) and **video** (timestamped action segments,
`action-segments-v1`); audio, text and 3D are out of scope and no surface claims
them.

- **`/` (root)** — the Next.js product: marketing pages, the Privy login flow, and the
  role workspaces (`buyer`, `contributor`, `reviewer`, `admin`). Product screens fetch
  through a token-bound client (`src/lib/api/platform.ts` / `live.ts`).
- **`/backend`** — the API-only Next.js app: Privy token verification, role guards,
  projects/assets/tasks/jobs, reviews, appeals, receipts, and accepted-only exports.
  It talks to Postgres/Storage with the service-role key.

Served over **HTTPS on `localhost:3000`** in development (external-wallet SIWE requires
it); the backend listens on `:3010`. Operational detail lives in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

**Official Judge URL (hosted demo):** `https://zeno-web-app.vercel.app`

## Prior work

Zeno's core marketplace was built **before Hacker House Goa 2026**, for a Monad hackathon:
Privy auth and roles, projects/assets/jobs/tasks, the image-box and video-segment editors,
gold scoring, review and appeals, receipts, exports, and the `JobEscrow` contract on Monad
testnet. Its original history is at
[`github.com/hsay123/zeno`](https://github.com/hsay123/zeno) (up to commit `cf77d5f`).

This repository starts from that code, imported as a single commit. **Everything committed
after that import commit is the HHG 2026 build** (from 2026-10-28): the move to Base/USDC,
buyer funding through Dodo Payments, a real AI reviewer, contributor reputation and the
royalty-split demo. See [`docs/PRD.md`](docs/PRD.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Getting started

Prerequisites: Node, and a filled-in `backend/.env.local` + root `.env.local`
(see the `.env.example` files). Migrations are applied to the Supabase project.

```bash
# terminal 1 — backend
cd backend && PORT=3010 npm run dev

# terminal 2 — frontend (generates a local cert on first run)
npm run dev            # https://localhost:3000
```

The first Privy login creates a `contributor`. Promote accounts with
`backend/scripts/set-role.ts` or the admin UI (`/workspace/admin`).

## Environment

Copy the examples — never commit `.env.local`:

- root `.env.example` → `.env.local` (public: `NEXT_PUBLIC_API_BASE_URL`,
  `PLATFORM_API_URL`, `NEXT_PUBLIC_PRIVY_APP_ID`).
- `backend/.env.example` → `backend/.env.local` (Supabase service role, Privy app
  secret, CORS origin, tuning, optional settlement). `DEV_AUTH_BYPASS` must be
  `false` for any run that counts as evidence.

## Checks

```bash
# Backend
cd backend && npm run typecheck && npm run lint && npm test && npm run build
# Frontend
npx tsc --noEmit && npm run lint && npm test && npm run build
# E2E (real stack, Playwright)
npx playwright test e2e/s1-auth-roles.spec.ts e2e/s2-buyer-job.spec.ts \
  e2e/s3-contributor-claim.spec.ts e2e/s4-reviewer-lifecycle.spec.ts \
  e2e/s5-receipts-export.spec.ts e2e/s6-lifecycle-admin.spec.ts
```

## Security posture

- Browser only ever holds the Privy access token + the public Privy app id.
- API authorization is server-side (`requireRole`); `DEV_AUTH_BYPASS` is refused in
  production.
- Postgres RLS is enabled and `anon`/`authenticated` hold **no** table privileges;
  `service_role` is used server-side only. See `backend/supabase/migrations/006_security_hardening.sql`.
- Settlement is **mock** until the escrow contract is funded and verified; the UI
  labels it as such. See [`docs/BLOCKED.md`](docs/BLOCKED.md).

## Documentation

- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — day-to-day operations.
- [`docs/STAGING.md`](docs/STAGING.md) — staging topology, deploy steps, key rotation.
- [`docs/BLOCKED.md`](docs/BLOCKED.md) — external blockers (key custody, Privy origins).
- [`docs/AUDIT-2026-10.md`](docs/AUDIT-2026-10.md) — product-alignment audit.
- [`docs/CVAT-INTEGRATION.md`](docs/CVAT-INTEGRATION.md) — CVAT decision and plan
  (not integrated; the native workspace is the supported editor).
