# Zeno — project memory / handoff (state at 2026-10-30, ~04:00 IST)

Read this first when continuing the work with any agent (Claude Code, OpenCode, …). Also read
`CLAUDE.md` (ground rules + checks), `AGENTS.md` (Next.js 16: read `node_modules/next/dist/docs/`
before writing Next code) and `docs/DEMO.md`. **No secrets are in this file**; they live only in the
git-ignored `backend/.env.local`, `.env.local`, `contracts/.env` and on Vercel.

## 1. What Zeno is

A self-serve data-labeling marketplace built for **Hacker House Goa 2026** (AI × Crypto, Oct 28–31,
demo day **Oct 31** with on-chain voting). Companies (buyers) upload images/video and post jobs;
contributors label inside Zeno; reviewers accept/reject; escrow pays contributors **only for
accepted labels**, in USDC on **Base Sepolia (testnet, chain 84532)**, with a public receipt per
payout. Startups can pull accepted labels through a paid **Data API**.

- Business: 20% commission (contributor keeps 80%); Data API plan $299/month.
- Zeno started at a Monad hackathon; everything since 2026-10-28 on branch `hhg-base-usdc` is HHG
  work. Keep the README "Prior work" section; never rewrite history.
- **Testnet only. No real funds** until `docs/AUDIT-2026-10.md` is cleared and keys are rotated.

## 2. Where things are

| | |
| --- | --- |
| Repo | `/home/yashh/Downloads/Zeno` → github.com/hsay123/Zenoo, branch **`hhg-base-usdc`** (all work pushed; last commit `a7b224d`) |
| Frontend | Next.js 16.4.3 at repo root → **https://zenolab.vercel.app** (Vercel project `zenolab`) |
| Backend | API-only Next.js in `/backend` → **https://zenolab-api.vercel.app** (Vercel project `zenolab-api`); frontend proxies `/platform/*` → backend |
| Vercel | user `yashh`, team `yashlandge150-gmailcoms-projects`. Deploy: `vercel deploy --prod --yes` (run in root for frontend, in `backend/` for backend) |
| Database | Supabase project `sfebambrdcfqrdmetflw`. Migrations `backend/supabase/migrations/001…017`, **all applied**. Supabase MCP is configured in `.mcp.json` (only loads when the agent starts in this folder) |
| Auth | Privy app **`cmv2vvueq01hu0gjju69ht0wf`** (the one with all users). Email OTP + wallet login, embedded wallets |
| Chain | Base Sepolia. USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals) |
| JobEscrow v3 | `0xa4B1053d0878Ae2b86640A547E125BEB20456962` |
| RoyaltySplitter | `0x5E625CA857b293E315d95846D13485785D233A66` (roadmap demo) |
| Wallets | owner `0x6E15Be04…8cE3` (deployer, ~5 USDC), relayer `0x0FB2Ef2e…1569` (payout signer), treasury `0xDe089C13…7A6B` (card funding + faucet float, **22.6 test USDC** after top-up) |
| Dodo Payments (test mode) | job-funding product `pdt_0Nqo5h61LU08kPScmAdL6` (one-time, pay-what-you-want, USD, $0.50 min); Data API plan `pdt_0NqnRXLpnaNkUZ7NOb05Z` ($299/mo). Webhook `https://zenolab-api.vercel.app/api/payments/dodo/webhook`, events `payment.*` + all `subscription.*`. API key scopes incl. `subscriptions:read` |
| viaSocket | org `83942`, embed project `projFQ72TE3u` (keys in env) |
| TigerGraph | Savanna workspace, graph `Zeno` (integrity checks) |

## 3. What is DONE (all committed, deployed, tested)

**Core (PRD F1–F6)**
- F1 Base Sepolia + USDC everywhere (contract, backend chain/decimals, Privy chains, UI labels).
- F2 Buyer funding: wallet (approve + fundJob, server verifies the tx) **and** card/UPI via Dodo
  (checkout → signed webhook → treasury funds escrow). Adaptive-currency (INR) payments verified
  through `settlement_amount`/`settlement_currency`. Unconfigured handlers answer 503 so Dodo retries.
- F3 Claude AI first-pass reviewer (`claude-sonnet-5-5`), fail-safe to humans — **built but OFF**
  (Anthropic account has no credit; user parked it).
- F4 Contributor reputation tiers (New → Verified → Trusted → Reviewer) with task gating.
- F5 RoyaltySplitter 50/30/20 demo (admin "Roadmap demo").
- F6 viaSocket event webhook (replaced Socket.dev at the user's request), Cake Wallet in onboarding,
  TigerGraph duplicate-account / self-review integrity checks.

**Added during HHG (beyond the PRD, at the user's request)**
- **Data API** (`/api/v1/*`, `docs/api/README.md`, `docs/system/DATA-API.md`, `/developers` page,
  Buyer → API screen): API keys `zeno_test_…` (hashed, shown once), formats zeno/coco/yolo + stream
  jsonl/csv, class filter/rename, bbox modes, deterministic split, `since`, signed media URLs, cursor
  pagination, 600 req/min, usage counter, OpenAPI. Gated by the **$299/mo Dodo subscription**
  (`subscription.*` webhooks re-fetch the subscription). User's org "robotics studio" has the plan
  **active** (sub `sub_0NqoJd2…`, renews 2026-11-29).
- **viaSocket Slack/Discord alerts** (Buyer/Contributor → Alerts): users connect their own Slack or
  Discord, pick a channel (or Slack DM), choose events (job funded, label reviewed, payout settled).
  Code `backend/lib/notify/apps.ts`, `/api/integrations/*`. User confirmed both connected on live.
- **Funding that never fails silently**: card refused (409, with reason) under $0.50, above the
  treasury float, or when treasury gas is low; funding screen reads the wallet's USDC + gas first,
  disables wallet funding when it can't pay, card becomes primary, plain-language wallet errors.
- **Testnet faucet** "Get free test funds" (`POST /api/jobs/{id}/faucet`): sends a buyer's *own*
  Privy wallet exactly what the job needs (2 USDC/grant, 5/day, refused once funded, recorded in
  `faucet_grants`). Gas-only top-up `POST /api/me/gas` (3/day) for withdrawals.
- **Account page** (Buyer/Contributor → Account): email or "Add an email" (Privy linkEmail), all
  linked wallets with balances, "Link a wallet" (Cake Wallet/MetaMask/WalletConnect), choose payout
  wallet (`PUT /api/me/payout-wallet`, own wallets only), **Send USDC** (withdraw) with automatic
  gas top-up on testnet. Optional email in company onboarding; `POST /api/me/sync` re-reads Privy.
- **Admin → Treasury** card (`GET /api/admin/treasury`) with low-float warnings.
- **Bugs found by the E2E check and fixed**: onboarding RPC signature (migration 014), contributor
  wallet not sent at onboarding, `funded_amount` number-vs-string breaking job creation, review
  decision response shape, sign-in slowness (Privy `getUserById` on every request → only on create),
  landing page hot-linking another company's video (removed).

**Tests**: backend 431 unit tests, frontend 70, contracts 64; Playwright e2e `e2e/s1…s10` all pass
(real Privy wallet logins, real Base Sepolia transactions, real Dodo test payments).

## 4. ⚠️ IN PROGRESS — do this first

**Privy secret / app name (user action half-done).** The OTP email showed "metropolice" (the old
name of Privy app `cmv2vvueq01hu0gjju69ht0wf`). The user rotated secrets and accidentally created a
**new** Privy app `cmvu37…` named "Zeno" (0 users, not used). Decision taken: **keep the existing
app and rename it**. State now:
- `backend/.env.local`: `PRIVY_APP_ID=cmv2vvueq01hu0gjju69ht0wf`, **`PRIVY_APP_SECRET=` is EMPTY**
  (the new app's id/secret are kept as comments only).
- Vercel `zenolab-api` has the **wrong** secret (the new app's) → on live: existing users can sign
  in, but new sign-ups lose their email and the faucet / wallet linking / payout-wallet / `me/sync`
  return 500 ("Invalid app ID or app secret").

To finish:
1. User: Privy dashboard → app `cmv2vv…` → Settings → App name = **Zeno** (+ logo); Settings → API
   keys → copy the current app secret into `backend/.env.local` `PRIVY_APP_SECRET=`.
2. Verify: `curl -u "$PRIVY_APP_ID:$PRIVY_APP_SECRET" -H "privy-app-id: $PRIVY_APP_ID" https://auth.privy.io/api/v1/apps/$PRIVY_APP_ID` → 200.
3. Push to Vercel **via stdin, without `--sensitive`** (that mangled it):
   `vercel env rm PRIVY_APP_SECRET production --yes`, then pipe the value into
   `vercel env add PRIVY_APP_SECRET production`; `cd backend && vercel deploy --prod --yes`.
4. Check live: `POST https://zenolab.vercel.app/platform/api/me/sync` with a signed-in token → 200.
5. Restart the local backend dev server so it loads the new secret.
6. Optionally delete the unused Privy app `cmvu37…`.

## 5. Next steps (in order)

1. Finish §4.
2. **Demo setup** (`docs/DEMO.md`): user posts a ~6-image job as "robotics studio" and pays by card
   (keep escrow ≤ ~20 USDC, total ≥ $0.50); then label + accept those tasks with the test
   contributor/reviewer accounts so the Data API has real data; create a `demo` API key.
3. **Real email-login E2E**: enable Privy **test accounts** (dashboard → User management → Test
   accounts; user must sign in to the dashboard), put `E2E_PRIVY_TEST_EMAIL` / `E2E_PRIVY_TEST_OTP`
   in `.env.local`, then write a spec: email company → job → card pay → email contributor → label →
   accept → payout → withdraw.
4. AI reviewer live once the user adds Anthropic credit (`npm run ai-review:smoke`, then it's on via
   `AI_REVIEWER=auto`). User said skip for now.
5. viaSocket **MCP server** for Zeno's API (planned, not built; would reuse Data API keys).
6. After the hackathon: **rotate every secret that was pasted in chat** (Privy, Supabase service
   role, Anthropic, Dodo key + webhook secret, viaSocket embed secret, TigerGraph secret).
7. Landing page: the faint "Pre-labelling Agent" graphic is the user's own (keep).
9. **Gold (qualification) tasks are consumed** when submitted (each one serves one contributor).
   Live pool: job `19e22649-724c-4ff0-9705-bb81c808b578` "Qualification: box the cup, red block and blue
   block" (30 gold tasks from `e2e/fixtures/qualification/qual-*.png` + `gold-answers.json`; a few used
   by e2e). New contributors (tier New) can ONLY claim gold tasks; Verified needs 5 passes at ≥80%.
   Top it up with the admin API (`POST /api/jobs/{id}/tasks {asset_ids, is_gold:true, gold_answer}`)
   or, better, make gold tasks reusable per contributor.
8. UX: Contributor → Available tasks shows task/job **ids**; show the job title, reward and labels instead (backend `GET /api/tasks/available` + `src/components/product/*Tasks*`). The workspace itself works for images (box drawing) and video (timeline segments).

## 6. How to run and check

```bash
# backend (port 3010) and frontend (https://localhost:3000)
cd backend && npx next dev -p 3010
npm run dev                                   # repo root; needs certificates/ (node scripts/ensure-dev-cert.mjs)

# checks (CLAUDE.md)
cd backend && npm run typecheck && npm run lint && npm test && npm run build
npx tsc --noEmit && npm run lint && npm test && npm run build       # repo root
cd contracts && forge test

# e2e (needs both dev servers). Sessions expire after ~1 h: recapture first.
for r in buyer contributor contributor2 contributor3 reviewer admin signout s6target; do node scripts/capture-session-auto.mjs $r; done
npx playwright test e2e/<spec>.spec.ts --reporter=line
```

E2E facts: test wallets are local keys in `playwright/.auth/wallet-<role>.key` (git-ignored); the
mock wallet signs **and broadcasts real Base Sepolia txs**; fixtures fund jobs on chain from the
buyer test wallet (`0x8D03…9c2f`, ~8 USDC); test contributors have `tier_floor = trusted`; test
org "E2E Robotics Co" has `api_plan = 'api'`; the sign-out test uses its own `signout` session
(sign-out revokes the Privy session).

## 7. Gotchas learned the hard way

- This machine's network drops often (Supabase "fetch failed"): retry before debugging code.
- Shell is zsh: `$var` does not word-split; use `bash -c` for loops over "a b" pairs.
- Some backend files are CRLF (e.g. `lib/env.ts`, `lib/auth/verifyToken.ts`): preserve line endings.
- Backend uses Next 16 Cache Components: `/api/v1` handlers call `await connection()` first.
- Route files may only export handlers; put helpers in `lib/`.
- Money is never floating point: USDC base units as bigint/strings (`parseUnits(x, 6)`).
- Privy wallet list hides injected test wallets: e2e helpers type "Brave" in the search box.
- `vercel env pull` cannot read sensitive values (returns a placeholder); don't use it to compare.
- viaSocket skill: fetch `https://flow.viasocket.com/documentation/skill.md` fresh every time; run
  `viasocket-check.mjs` (0 FAIL) after changing the integration.
- Ground rules: ask before deploying contracts, touching mainnet, adding dependencies, or changing
  an existing API response; never print or commit secrets.
