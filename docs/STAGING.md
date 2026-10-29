# Staging deployment — Zeno

> **HHG 2026 (from 2026-10-28): settlement moved to USDC on Base Sepolia.**
> The escrow is now ERC-20 (`SETTLEMENT_ABI_VERSION` 3) and the backend reads
> `CHAIN_ID` (84532), `RPC_URL` and `USDC_ADDRESS`; see `contracts/README.md`
> and `docs/RUNBOOK.md` §2. Hosted environments are still on mock settlement until their env is updated.
>
> **Deployed 2026-10-29 (Base Sepolia, chain 84532):** USDC `JobEscrow` (ABI v3) at
> [`0xa4B1053d0878Ae2b86640A547E125BEB20456962`](https://sepolia.basescan.org/address/0xa4B1053d0878Ae2b86640A547E125BEB20456962),
> deploy tx [`0x4e46e3cf…2d5e0e5f`](https://sepolia.basescan.org/tx/0x4e46e3cf1927a08dfcb63ff33a14bfc32d10c3ea24fa209ace5bdf992d5e0e5f).
> Owner `0x6E15Be04e1657DafcCcDcE3c97a028ea8d6e8cE3`, relayer
> `0x0FB2Ef2e0440ceE42c0a7A5160801Af554E51569`, token Circle test USDC
> `0x036CbD53842c5426634e7929541eC2318f3dCF7e`; treasury signer
> `0xDe089C13bc56460085b3c43Db4C9ccA18BBA7A6B`. All three are fresh testnet-only keys.
> Local `npm run settlement:preflight`: all 12 checks PASS (`mode=chain`).
> **RoyaltySplitter (F5 roadmap demo)** at
> [`0x5E625CA857b293E315d95846D13485785D233A66`](https://sepolia.basescan.org/address/0x5E625CA857b293E315d95846D13485785D233A66)
> (deploy tx [`0x7813cc40…cd0e379e`](https://sepolia.basescan.org/tx/0x7813cc4008d0e14a890ca1e0fadb2f902cd0e379e0186c04bda719dfb5e5e0e3)):
> owner = escrow owner, Zeno share → treasury, split 5000/3000/2000 bps, token = test USDC. Source not yet
> verified on Basescan (needs an Etherscan API key). The Monad-testnet
> deployment and payout described below (§4.2) are **prior work**, kept as a
> historical record: that ABI v2 escrow is refused by the current preflight.
> `MONAD_RPC_URL` is still read as a fallback alias, so existing `zeno-api`
> settings keep loading; a Monad RPC simply fails the chain check.

Status: **app layer deployed and verified on Vercel; real settlement has been
demonstrated end-to-end on Monad testnet against the hardened escrow, but the
Vercel `zeno-api` project has not yet been switched to chain settlement.**
Frontend and backend are independent Vercel projects. No secret values are
written here.

## 1. Topology (as built)

| Part | What it is | Host |
| --- | --- | --- |
| **Frontend** | repo root, Next.js app (`src/`) | Vercel — `zeno-web` |
| **Backend** | `backend/`, API-only Next.js app | Vercel — `zeno-api` |
| **Database + Storage** | Supabase project `sfebambrdcfqrdmetflw` | managed (shared with dev) |
| **Auth** | Privy app | managed |
| **Settlement** | `contracts/JobEscrow.sol` | Monad testnet (chain 10143). **Hardened JobEscrow deployed at `0xB5fA1538cE1BC468Af07Dd0A32431FAF8cd9755C` (ABI v2).** Staging (`zeno-api`) is still mock; local dev has chain settlement enabled. See §4.2 |

URLs:

- Frontend (official judge URL): **https://zeno-web-app.vercel.app**
- Backend / API health: **https://zeno-api.vercel.app/api/health**

> **Official Judge URL — Do Not Change**
> `https://zeno-web-app.vercel.app` is the canonical public URL for the Zeno hackathon demo.
> It must remain the URL shared with judges, used in the README and demo documentation,
> and used as the frontend origin for the hosted Preview application.
> Never substitute a unique Vercel deployment URL, a different project domain,
> or a newly generated URL in user-facing materials.

The browser talks only to the frontend origin. `next.config.ts` rewrites
`/platform/*` to the backend server-side, so there are no cross-origin browser
requests in normal use. The `/platform` rewrite target is `PLATFORM_API_URL`.

> `render.yaml` is kept as an alternative backend config, but the live backend
> is the Vercel project above.

## 2. Vercel configuration (as built)

Both projects are in the `yashlandge150-gmailcoms-projects` team and deploy from
the repo root / `backend` respectively.

### 2.1 Frontend — `zeno-web`

| Setting | Value |
| --- | --- |
| Root Directory | `.` (repo root) |
| Framework | Next.js |
| Install / Build | `npm ci` / `npm run build` |
| Alias | `zeno-web-app.vercel.app` |
| Ignore | `.vercelignore` excludes secrets, `node_modules`, and unrelated trees |

Environment variables (production):

| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `/platform` |
| `PLATFORM_API_URL` | `https://zeno-api.vercel.app` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | the Privy app id (public) |

### 2.2 Backend — `zeno-api`

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Framework | Next.js |
| Health Check | `/api/health` |
| Alias | `zeno-api.vercel.app` |
| `maxDuration` | `30` seconds on `/api/settlement/accept` |

Environment variables (production; secrets are Vercel-encrypted):

| Var | Kind |
| --- | --- |
| `SUPABASE_URL` | value |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** |
| `SUPABASE_STORAGE_BUCKET` | `media` |
| `FRONTEND_ORIGIN` | `https://zeno-web-app.vercel.app` |
| `PRIVY_APP_ID` | value |
| `PRIVY_APP_SECRET` | **secret** |
| `DEV_AUTH_BYPASS` | `false` |
| `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` |
| `LEASE_MINUTES` / thresholds | defaults |
| `SETTLEMENT_PRIVATE_KEY` | **secret** (relayer key; inert until the escrow address is set) |
| `JOB_ESCROW_ADDRESS` | hardened escrow `0xB5fA…755C`; **not set on `zeno-api` yet** — staging stays mock until §4.2 is applied there. Set locally to enable chain settlement (§4.2) |
| `SETTLEMENT_FORBIDDEN_ADDRESS` | comma-separated known-compromised addresses; **required** — real settlement stays off while it is missing (§4.2) |
| `SETTLEMENT_RELAYER` (deploy input) | public address only; the keys live in `contracts/.env` (git-ignored), never in Vercel |

Redeploy: `cd backend && vercel link --project zeno-api && vercel deploy --prod`.

### 2.3 GitHub integration — Root Directory decides which app builds

The GitHub app deploys **both** projects on every push. Which app a project
builds is decided by its **Root Directory** setting, which lives only in the
Vercel project (never in the repo), so it can drift silently:

| Project | Root Directory | Builds |
| --- | --- | --- |
| `zeno-web` | `.` (repo root) | the frontend (`motivelabs@0.1.0`) |
| `zeno-api` | `backend` | the API (`backend@0.1.0`) |

### 2.4 Official Judge URL — Branch Tracking Configuration

**The official judge URL `https://zeno-web-app.vercel.app` is a Vercel project subdomain.**
Vercel's native branch-domain assignment only works for **custom domains**, not
project subdomains (`project.vercel.app`). Therefore, the official URL is kept
pointing to the latest successful `release/rc-integration` Preview deployment
via an **automated post-deployment alias update workflow**.

#### Current routing (verified 2026-10-14)

| URL | Target | Tracking |
| --- | --- | --- |
| `https://zeno-web-app.vercel.app` | Latest `release/rc-integration` Preview | Automated alias update |
| `https://zeno-web-git-release-rc-a42c93-yashlandge150-gmailcoms-projects.vercel.app` | Same Preview (branch alias) | Native Vercel branch alias |
| `https://motivelabs-web.vercel.app` | Production | Native Vercel Production alias |

#### Alias update workflow

Run **after every successful `release/rc-integration` deployment** to re-point
the official URL to the new Preview deployment:

```bash
# From repo root
node scripts/update-zeno-web-app-alias.js
```

The script (`scripts/update-zeno-web-app-alias.js`):
1. Queries Vercel for the latest successful `release/rc-integration` Preview
2. Runs health checks (`/` and `/platform/api/health` → HTTP 200)
3. Updates the alias `zeno-web-app.vercel.app` → new deployment URL
4. Verifies the alias resolves and health checks pass

The script **never aliases a failed deployment, wrong branch, or Production**.

#### Vercel project subdomain limitation

`zeno-web-app.vercel.app` is a project subdomain (not a custom domain).
Vercel's branch-domain assignment only supports custom domains.
If a custom domain is added later, it should be configured in the Vercel
dashboard to track the `release/rc-integration` branch Preview, and the
project subdomain alias workflow can be retired.

Observed failure (main `38a2afc`): `zeno-api` had its Root Directory **empty**,
so the GitHub build ran the repo-root **frontend** inside the API project. That
project has no `NEXT_PUBLIC_PRIVY_APP_ID`, so static prerender of `/_not-found`
threw from `src/components/providers/Providers.tsx` and the deployment errored.
The app code was fine — the project was pointed at the wrong directory.

Symptom in a failing `zeno-api` build log:

```
Cloning github.com/hsay123/Zeno (Branch: main, Commit: <sha>)
> motivelabs@0.1.0 build                     <-- wrong root (frontend)
Error: NEXT_PUBLIC_PRIVY_APP_ID is not set   (src/components/providers/Providers.tsx)
```

Correct build for the same push:

```
Cloning github.com/hsay123/Zeno (Branch: main, Commit: <sha>)
> backend@0.1.0 build
```

Fix / check: in the `zeno-api` project **Settings → Build & Development**, set
**Root Directory = `backend`**. Then a git-triggered production deployment for
`main` must log `> backend@0.1.0 build` and serve `/api/health` with `200`.

> CLI note: deploy the backend with `cd backend && vercel deploy --prod`. A CLI
> deploy from the repo root fails with *"The specified Root Directory 'backend'
> does not exist"* because the root `.vercelignore` excludes `backend/` from
> the upload.

## 3. Verified so far

| Check | Result |
| --- | --- |
| Backend `GET /api/health` | `200 {"status":"ok",…}` |
| Frontend `/` | `200`, real title, 259 KB |
| Frontend `/platform/api/health` (proxy) | `200` (rewrite works) |
| Anonymous `GET /api/jobs` | `401 UNAUTHORIZED` |
| CORS from `https://zeno-web-app.vercel.app` | `access-control-allow-origin` = the web origin |
| Settlement endpoint `POST /api/settlement/accept` | `401` without auth (admin only) |
| SSO protection | **disabled** on both projects (public) |

## 4. Remaining to finish the demo

### 4.1 Privy allowed origin (required for browser login)

Add **`https://zeno-web-app.vercel.app`** to the Privy app's allowed origins
(and redirect URLs if email/OTP is on). Without it, SIWE/login from the staging
origin fails. This is a dashboard action.

### 4.2 Rotate keys, deploy the corrected JobEscrow ✅ (testnet done; Vercel step pending)

**The old key is treated as compromised.** A settlement private key was exposed
in a screenshot, and the previously deployed contract used one address as both
owner and relayer (`0x8084a4eD8849B7B12E57f9e443ECe05E89838767`). Do not reuse
or re-fund it.

Required human action — generate **two fresh** testnet-only keys and share only
their public addresses:

1. **Owner key** — contract owner, retains funds authority and `closeJob`.
2. **Relayer key** — backend settlement signer (`SETTLEMENT_PRIVATE_KEY`).

Fund the **owner** address from the faucet (`https://faucet.monad.xyz`), then
deploy with the two public addresses (the corrected contract separates the
identities and derives the funder from `msg.sender`):

```bash
cd contracts
export DEPLOYER_PRIVATE_KEY=0x…   # fresh owner key (funded); owns the contract
export SETTLEMENT_RELAYER=0x…     # fresh relayer public address (≠ owner)
forge script script/Deploy.s.sol:DeployJobEscrow --rpc-url monad_testnet --broadcast
```

Done on Monad testnet (2026-10-13): owner `0xbF7e6C11eBB7E2c3dE4d5fEbE940c1Df66d94585`
and relayer `0x0e25d279345FDFbA748319CB670223261B735d45` were generated and
funded, and the hardened `JobEscrow` was deployed at
**`0xB5fA1538cE1BC468Af07Dd0A32431FAF8cd9755C`** (deploy tx
`0x5cd9c17e9d5d9d9b42c1da776091115d4fa5f813c30857ac77a421d2539a550d`).
On-chain: `owner()` = owner, `relayers(relayer)` = true, `SETTLEMENT_ABI_VERSION()` = 2.
A real 1 MON payout was then settled end-to-end through the app and verified
on-chain (tx `0x1f4a132843e7b048a3e948ab14354c20f058d09b3fa982501bb3fba11ae76044`,
`is_mock = false`). Locally `JOB_ESCROW_ADDRESS` points at this contract, so the
preflight passes and the backend selects `ChainSettlementService`.

The remaining step is to apply the same settings on Vercel (§4.2 step 3).

3. Set the new `JOB_ESCROW_ADDRESS`, the fresh `SETTLEMENT_PRIVATE_KEY`, and
   `SETTLEMENT_FORBIDDEN_ADDRESS` (the old compromised address, at minimum) on
   the `zeno-api` Vercel project and redeploy. Real settlement turns on only when
   all of them are present **and the fail-closed preflight passes at runtime** —
   the backend re-runs the preflight (chain 10143, escrow has code, escrow
   reports `SETTLEMENT_ABI_VERSION`, signer is a relayer that is not the owner,
   deny-list present and clean) before it will ever sign a payout. Any failure
   keeps `MockSettlementService` and `is_mock = true`.
4. Fund the job being shown (the broadcasting key is recorded as the funder):

   ```bash
   export JOB_ESCROW_ADDRESS=0x…
   export JOB_ID_HASH=$(cast keccak "$JOB_UUID")
   export JOB_FUND_WEI=100000000000000000   # 0.1 MON
   forge script script/FundJob.s.sol:FundJob --rpc-url monad_testnet --broadcast
   ```

### 4.3 Preview readiness (checked 2026-10-13, no deploy triggered)

Both Vercel projects are linked and live:

| Project | Env present (Preview + Production) | Missing |
| --- | --- | --- |
| `zeno-api` (`backend/`) | `SUPABASE_*`, `PRIVY_*`, `FRONTEND_ORIGIN`, `MONAD_RPC_URL`, `SETTLEMENT_PRIVATE_KEY`, tuning | `SETTLEMENT_FORBIDDEN_ADDRESS`, `JOB_ESCROW_ADDRESS` in Preview (both only needed to turn real settlement on) |
| `zeno-web` (root) | `NEXT_PUBLIC_PRIVY_APP_ID`, `PLATFORM_API_URL`, `NEXT_PUBLIC_API_BASE_URL` | none for a mock preview |

A mock-only preview needs only the **Privy allowed origin** for the preview web
domain (`https://<preview>.vercel.app`) added in the Privy dashboard — without
it, browser SIWE login on the preview origin is rejected. A preview that moves
real money additionally needs the §4.2 custody + escrow work plus
`SETTLEMENT_FORBIDDEN_ADDRESS` on `zeno-api`. Deploying this branch does **not**
enable real settlement: the runtime preflight fails closed, so the currently
configured production settings (old escrow + exposed key, no deny-list) fall
back to `MockSettlementService`.

## 5. Roles / accounts

Promote real Privy accounts to buyer/reviewer/admin after first login:

```bash
cd backend
npx tsx scripts/set-role.ts you+buyer@example.com buyer
npx tsx scripts/set-role.ts you+reviewer@example.com reviewer
npx tsx scripts/set-role.ts you+admin@example.com admin
```

## 6. Full workflow smoke test (after §4)

1. Buyer login → project → signed upload → asset → job + tasks → publish.
2. Contributor → claim → draft → submit; second claimant → **409**.
3. Reviewer → accept (or revise/reject/appeal); contributor decision → **403**.
4. Admin → `POST /api/settlement/accept`; when escrow is configured and the job
   funded, the contributor is paid on Monad testnet and the receipt shows
   `is_mock = false` with the real tx hash.
5. Export contains only accepted versions and no contributor identity;
   non-owner → **403**.

## 7. Known limitations

- Shared Supabase project: staging and dev share data. A separate project needs
  migrations 001–009 + the `media` bucket (`backend/supabase/all_migrations.sql`).
  (008 onboarding RPC and 009 settlements ledger are applied here.)
- Vercel Authentication was disabled on both production deployments. `maxDuration = 30`
  is set on the settlement route so the receipt wait is not cut off at the 10 s default.
- Settlement is crash-safe now: a `settlements` row (unique per task) is written
  **before** the chain call, the broadcast hash is stored as soon as it is known,
  and the receipt/task flip happen only after verification. A lost response is
  recovered by retrying `POST /api/settlement/accept` or by
  `POST /api/settlement/reconcile` (re-verifies on-chain; never re-pays). See
  `backend/supabase/migrations/009_settlements_ledger.sql` and
  `backend/lib/settlement/service.ts`.
- Staging (`zeno-api`) still runs mock settlement: `JOB_ESCROW_ADDRESS` is unset
  there, so receipts stay `is_mock = true` until §4.2 step 3 is applied. The
  hardened `JobEscrow` **is** deployed (`0xB5fA…755C`) and a real payout has been
  verified against it locally. The backend re-runs the fail-closed preflight **at
  runtime** before it will ever sign: real settlement is selected only when the
  settings exist AND the preflight passes (chain `10143`, escrow code present,
  escrow reports `SETTLEMENT_ABI_VERSION = 2`, signer is an allow-listed relayer
  different from the owner, deny-list present and clean, including a built-in list
  of known-compromised addresses). Otherwise `MockSettlementService` stays in
  effect. The stale pre-hardening escrow `0x4A8E…1fE8` fails the ABI-version
  check, so it can never receive real payouts.
- Running the full local e2e suite **with chain settlement enabled**: `s5` asserts
  a **mock** receipt, so it is expected to fail when `JOB_ESCROW_ADDRESS` is set.
  Unset it (or point at a mock backend) for s5; every other spec is
  mode-independent. `e2e/s7-real-settlement.spec.ts` self-skips unless `S7_LIVE=1`
  and a funded fixture are present.
- CVAT is **not integrated**. The supported editor is the built-in workspace
  (image boxes; video timeline with seek, Set start/Set end and debounced
  autosave). The adapter design, mapping and the host/credentials a human must
  provide are in [`docs/CVAT-INTEGRATION.md`](CVAT-INTEGRATION.md). No surface
  claims CVAT support.

## 8. Commit history

This document tracks the running branch, so hashes go stale; read the live
history instead:

```bash
git log --oneline origin/main..HEAD    # work on fix/product-alignment-critical
```

The settlement key/indexing work referenced above lives in
`backend/lib/settlement/` and `contracts/src/JobEscrow.sol`.