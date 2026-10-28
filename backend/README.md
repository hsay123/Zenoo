# Zeno Network – Backend

API-only Next.js 16 App Router project. No UI pages. All routes live under `/api`.

---

## Prerequisites

- Node.js 20+
- npm 10+
- A Supabase project (free tier works for dev)

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase URL and service role key

# 3. Run database migrations
#    Option A – Supabase CLI (recommended):
npx supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
#    Option B – paste each file in supabase/migrations/ into the Supabase SQL editor

# 4. Seed the database
npm run seed

# 5. Start the dev server
PORT=3010 npm run dev
# Runs on http://localhost:3010 (the unrelated trapnet-dashboard container owns :3001)
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (default port 3000; `PORT` overrides, this repo uses 3010) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run test` | Run Vitest tests |
| `npm run seed` | Seed dev data into Supabase |

---

## Environment variables

See [`.env.example`](.env.example) for full documentation.

Key variables:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role key (never expose to frontend) |
| `SUPABASE_STORAGE_BUCKET` | Optional | Private bucket for job media (default: `media`) |
| `FRONTEND_ORIGIN` | ✅ | Frontend origin for CORS (e.g. `https://localhost:3000`) |
| `PRIVY_APP_ID` | Production | Privy app ID for token verification |
| `PRIVY_APP_SECRET` | Production | Privy app secret |
| `DEV_AUTH_BYPASS` | Dev only | Set `true` to skip Privy; use `x-dev-user-id` header |
| `LEASE_MINUTES` | Optional | Task lease duration (default: 30) |
| `AI_CONFIDENCE_THRESHOLD` | Optional | Below this, AI decisions go to human queue (default: 0.75) |
| `GOLD_IOU_THRESHOLD` | Optional | Minimum IoU for gold task pass (default: 0.5) |
| `GOLD_SEGMENT_MS_TOLERANCE` | Optional | Timing tolerance for gold video scoring (default: 500ms) |
| `FAST_SUBMIT_THRESHOLD_SECONDS` | Optional | Flag submissions faster than this after claim (default: 30) |

---

## DEV auth bypass

When `DEV_AUTH_BYPASS=true` (development only), skip Privy by passing:

```http
x-dev-user-id: 5eed0000-0000-4000-8000-000000000002
```

Seed IDs are printed when you run `npm run seed`.

**This mode is disabled when `NODE_ENV=production`.**

---

## Migrations

Migrations are in `supabase/migrations/` as numbered SQL files:

| File | Description |
|---|---|
| `001_initial_schema.sql` | All tables, enums, indexes, RLS |
| `002_updated_at_triggers.sql` | Auto-update `updated_at` columns |
| `003_seed_schema_versions.sql` | Canonical schema versions |
| `004_task_drafts.sql` | Draft autosave storage (`task_drafts`) |
| `005_appeals_indexes.sql` | Appeal lookup/queue indexes |

Apply them in order. RLS is enabled on every table with **no policies**, so the `anon` key sees nothing. Only the service-role key (server-side) can read/write.

---

## Seed media

Place placeholder files at:
```
supabase/seed-media/image_task_001.jpg
supabase/seed-media/video_task_001.mp4
```

Then upload them to your private Supabase Storage bucket under the same paths, or update `object_key` values in `scripts/seed.ts`.

---

## API documentation

See [`../docs/API.md`](../docs/API.md) for the full API contract.

---

## Architecture

```
backend/
├── app/api/          # Next.js route handlers
│   ├── health/       # GET /api/health
│   ├── me/           # GET /api/me
│   ├── jobs/         # /api/jobs (+ [id], [id]/publish, [id]/export)
│   ├── tasks/        # /api/tasks/available, [id], [id]/claim, [id]/draft, [id]/submit
│   ├── review/       # /api/review/queue, /api/review/appeals/queue
│   ├── reviews/      # /api/reviews/[submissionId]/decision
│   ├── submissions/  # /api/submissions/[id]/appeal
│   ├── appeals/      # /api/appeals/[id]/decision
│   ├── settlement/   # /api/settlement/accept
│   ├── receipts/     # /api/receipts/[id]
│   ├── earnings/     # /api/earnings
│   └── ...
├── lib/
│   ├── annotation/   # Semantic payload validation + reason codes
│   ├── api/          # Response helpers, CORS, errors, request, pagination
│   ├── appeals/      # Appeal submission, adjudication, queue
│   ├── auth/         # verifyToken, requireRole
│   ├── db/           # Supabase client
│   ├── export/       # Accepted-label export + provenance manifest
│   ├── jobs/         # Job row mapping + ownership
│   ├── review/       # Routing, MockAiReviewer, review repository/service
│   ├── settlement/   # MockSettlementService, receipts, earnings, money
│   ├── tasks/        # State machine, leases, row mapping, gold scoring, submit flow
│   ├── validation/   # zod request + payload schemas
│   ├── hash.ts       # Canonical JSON + keccak256
│   ├── idempotency.ts
│   ├── rateLimit.ts
│   ├── storage.ts    # Signed media URLs
│   └── env.ts        # Environment validation
├── supabase/
│   └── migrations/   # SQL migration files
├── scripts/
│   └── seed.ts       # Dev seed data
└── src/types/api.ts  # TypeScript types for frontend
```
