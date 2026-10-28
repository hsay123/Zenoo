# BLOCKED — things only a human can provide

This file lists the exact things that stop work, with the command or value needed to unblock.

---

## B1 — Database schema — ✅ RESOLVED (2026-10-12, via the Supabase MCP server)

The 14-table schema was applied to `sfebambrdcfqrdmetflw.supabase.co` from the repo migrations
(`backend/supabase/migrations/001…005`, same content as `backend/supabase/all_migrations.sql`) through the
authenticated Supabase MCP server — `apply_migration` per file, in order — then `notify pgrst, 'reload schema';`.

Verification (all green):

| Check | Result |
| --- | --- |
| `list_migrations` | `001_initial_schema` … `005_appeals_indexes` recorded |
| `information_schema` | 14 public tables, 8 enum types, 14/14 tables RLS-enabled |
| `schema_versions` | seeded, 2 rows (`image-boxes-v1`, `action-segments-v1`) |
| `scripts/infra-check.mjs` | **INFRA READY** |

**No GRANTs were added.** The Data API (anon/authenticated) still sees nothing — RLS is enabled with no
policies on every table, per the service-role-only design. The backend talks to the database with the
service-role key (bypasses RLS), so the app needs no extra grants.

To re-apply on another project later: Supabase SQL editor → paste `backend/supabase/all_migrations.sql`
→ Run, then `cd backend && npm run seed`.

---

## B2 — Storage bucket `media` — ✅ RESOLVED

Created via the Storage API on `sfebambrdcfqrdmetflw`: `POST /storage/v1/bucket {"id":"media","name":"media","public":false}`
→ HTTP 200. Verified private by `scripts/infra-check.mjs`.

---

## B3 — Privy login can now be automated — ✅ FULLY RESOLVED

Privy's email-OTP test credentials stay disabled, so the server cannot mint tokens. But the
external-**wallet** path is fully automatable: `scripts/capture-session-auto.mjs <role>` announces a mock
EIP-6963 wallet whose signatures are produced by a real local secp256k1 key (`viem`) — genuine
signatures, real Privy session, no human in the loop. It saves `playwright/.auth/<role>.json`
(gitignored) and verifies `/api/me` resolves before declaring success.

Each role gets its own wallet (`playwright/.auth/wallet-<role>.key`, gitignored, generated on first
use), so buyer / contributor / reviewer / admin are four distinct real users. Promote each to its role
the first time with `backend/scripts/set-role.ts` (now accepts email, wallet address, or Privy DID):

```
node scripts/capture-session-auto.mjs buyer   # prints the wallet address
(cd backend && npx tsx scripts/set-role.ts 0x… buyer)
```

Re-run the capture for a role right before a browser run; the captured session is a real access token
with a ~1h lifetime and Privy rotates refresh tokens, so a stale file lands on `/login`.

The headed manual flow (`node scripts/capture-sessions.mjs <role>`) still works for a human's own
account if needed. 2026-10-12: all four roles captured automatically; S1 green (5/5), S2 green (2/2).

## B4 — Privy dashboard allowed origin

`https://localhost:3000` must be listed under the Privy app's allowed origins, or the browser SDK login is
rejected. (Dashboard setting — cannot be changed from here.) The frontend runs on :3000 over **HTTPS**
(Sign-In with Ethereum requires it — see B7), matching the origin to allow-list.

---

## B5 (OPTIONAL / Tier 2) — funded testnet keys — ✅ RESOLVED (2026-10-13)

Two fresh testnet-only keys now exist (owner + relayer), both funded with testnet MON, and are kept in
gitignored local files (`contracts/.env`, `backend/.env.local`). The exposed key
(`0x8084a4eD8849B7B12E57f9e443ECe05E89838767`) stays on the preflight deny-list and is never used. See B8
for the deploy + first real payout.

---

## B6 — frontend env — ✅ RESOLVED

Frontend `.env.local` now holds the public app id and the same-origin API path:
```
NEXT_PUBLIC_API_BASE_URL=/platform        # browser → same-origin HTTPS proxy (next.config.ts)
PLATFORM_API_URL=http://localhost:3010    # server-side rewrite target (not public)
NEXT_PUBLIC_PRIVY_APP_ID=cmv2vvueq01hu0gjju69ht0wf   (public identifier)
```
`@privy-io/react-auth` is installed and `PrivyProvider` wraps the app (email + wallet, embedded wallet for
users without one, Monad testnet default chain). Backend `FRONTEND_ORIGIN` is `https://localhost:3000`.

Port note: an unrelated container owns :3001, so the backend runs on :3010 and the frontend on :3000.

## B7 — wallet origin vs. `http://localhost` — ✅ FIXED

Brave Wallet rejected wallet login on `http://localhost:3000` because Privy's SIWE `domain` is scheme-less
and ERC-4361 defaults it to `https`, so the origin appeared to differ. Fixed by serving dev over HTTPS:
`npm run dev` now uses `next dev --experimental-https` with a cert generated into `certificates/`
(gitignored) by `scripts/ensure-dev-cert.mjs`; the API is proxied same-origin under `/platform`.
Verified by `scripts/verify-wallet-siwe.mjs`. Re-run `sudo mkcert -install` once to remove the browser's
self-signed-certificate warning.

---

## B8 — key custody + contract redeploy — ✅ RESOLVED for local/testnet (staging deploy still pending)

A settlement private key was exposed in a screenshot and is treated as **compromised**. The old contract
also used a single address as both owner and relayer (`0x8084a4eD8849B7B12E57f9e443ECe05E89838767`).

What was done (2026-10-13):

- Two fresh testnet-only keys exist: **owner** `0xbF7e6C11eBB7E2c3dE4d5fEbE940c1Df66d94585` (deployer +
  funder) and **relayer** `0x0e25d279345FDFbA748319CB670223261B735d45` (backend signer). They are distinct,
  funded, and never interchanged. Keys stay in gitignored local files; only addresses are written here.
- The hardened `JobEscrow` (owner/relayer split, `msg.sender` funder, `closeJob` gate, reentrancy guard,
  `SETTLEMENT_ABI_VERSION = 2`) is deployed to Monad testnet at
  **`0xB5fA1538cE1BC468Af07Dd0A32431FAF8cd9755C`** (deploy tx
  `0x5cd9c17e9d5d9d9b42c1da776091115d4fa5f813c30857ac77a421d2539a550d`).
- On-chain verification: code present, `owner()` = owner, `relayers(relayer)` = true,
  `SETTLEMENT_ABI_VERSION()` = 2.
- The fail-closed preflight passes (`cd backend && npm run settlement:preflight` → `mode=chain ok=true`,
  chainId 10143, all checks PASS), and the backend enforces the same preflight at runtime before selecting
  the chain service. The built-in deny-list always includes the exposed address.
- **First real payout verified on-chain**: video job → contributor claim/annotate/submit → human reviewer
  accept → `POST /api/settlement/accept`. Receipt `is_mock = false`, tx
  `0x1f4a132843e7b048a3e948ab14354c20f058d09b3fa982501bb3fba11ae76044`: `TaskSettled`
  (jobId/taskId from `keccak256(utf8(uuid))`, payee = contributor wallet, amount = 1 MON, annotationHash =
  the accepted submission hash). Contributor balance went 0 → 1 MON. Reconciliation is idempotent
  (`finalized=[]`, `unresolved=[]`; a second settle returns the same receipt).

Still a human action (deliberately **not** done here — no production secrets were touched):

1. On `zeno-api` (Vercel), set the new `JOB_ESCROW_ADDRESS` and the fresh relayer `SETTLEMENT_PRIVATE_KEY`,
   and set `SETTLEMENT_FORBIDDEN_ADDRESS` to keep refusing the exposed address.
2. Confirm `npm run settlement:preflight` passes in that environment before enabling chain settlement.

The old, unmodified contract at `0x4A8E371E89cF9989682Ed0bD5cD1cCa457281fE8` predates the hardening and is
no longer used.

## B9 — Privy allowed origins for the live domains

`https://zeno-web-app.vercel.app` must be added under the Privy app's **Allowed Origins** (and redirect
URLs if email/OTP is enabled) or browser login on staging is rejected. Dashboard-only action; not done
from here. `https://localhost:3000` (B4) is also still required for local development.
