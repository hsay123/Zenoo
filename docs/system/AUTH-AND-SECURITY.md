# Auth and security

## 1. Identity and login **[live]**

- **Privy** handles login: email OTP or external wallet (SIWE). Users without a wallet get a
  Privy embedded wallet on login.
- WalletConnect enabled in `PrivyProvider` so mobile wallets such as Cake Wallet can
  connect (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`). Supported chain from `NEXT_PUBLIC_CHAIN_ID`
  (Base Sepolia by default). No `defaultChain`, so external wallets are not forced to switch
  during login (see `docs/E2E-EVIDENCE.md`).
- The browser holds only the Privy access token and the public app id.

## 2. Request authentication

`backend/lib/auth/verifyToken.ts`:

1. Verify the Privy JWT: ES256, `iss = privy.io`, `aud = PRIVY_APP_ID`, not expired. The key
   comes from `PRIVY_VERIFICATION_KEY` or the Privy API.
2. Look up the user by `privy_did`; create on first login.
3. `requireRole(req, ...roles)` rejects suspended users and wrong roles.

`DEV_AUTH_BYPASS=true` (header `x-dev-user-id`) is refused at startup in production and must be
`false` for any run used as evidence.

## 3. Roles and authorization

| Role | Gets it by | Can |
| --- | --- | --- |
| contributor | onboarding choice | claim/label/submit, appeal, see own earnings |
| buyer | onboarding choice (creates org) | projects, assets, jobs, funding, exports for own org |
| reviewer | admin promotion only | review queue, decisions |
| admin | admin promotion only | users, roles, settlement queue, appeals |

Onboarding accepts only `buyer | contributor`; reviewer/admin are never self-selectable (audit
F14). Ownership checks (`loadJobForActor`, lease owner checks) run in every service, not just
in the route.

## 4. Data protection

- **Postgres:** RLS enabled on all tables; `anon` and `authenticated` have no privileges
  (migration 006). Only the backend's service-role key reads/writes.
- **Storage:** private bucket. Uploads use signed upload URLs; reads use 300 s signed URLs issued
  only to the buyer who owns the project or to the contributor holding the task's lease.
- **Gold answers** never leave the server.
- **Exports and receipts** contain no contributor identity (no email, DID or user id).
- **Buyer data** is private by default and belongs to the buyer; the opt-in data API is roadmap.
- **[HHG]** Images sent to the AI reviewer go via a short-lived signed URL to a provider whose
  terms do not allow training on inputs; this is noted in the buyer-facing privacy copy.

## 5. Keys and secrets

| Secret | Lives in | Notes |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | backend env | never in the frontend |
| `PRIVY_APP_SECRET` | backend env | |
| `SETTLEMENT_PRIVATE_KEY` (relayer) | backend env | may only `settle` |
| escrow owner key | offline / deployer machine | never on a server |
| **[HHG]** treasury key | backend env | funds escrow after Dodo payments; test USDC only this week |
| **[HHG]** `DODO_WEBHOOK_SECRET`, `DODO_API_KEY` | backend env | test mode |
| **[HHG]** AI provider key | backend env | |

Rules:

- Owner, relayer and treasury are **three different keys**. The contract rejects
  owner == relayer; the preflight rejects any key in `SETTLEMENT_FORBIDDEN_ADDRESS` plus the
  built-in compromised list.
- The key from earlier development (audit F15) is **compromised**: never reuse it, on any chain.
- Before HHG settlement: generate fresh owner + relayer (+ treasury) keys, deploy a new escrow on
  Base Sepolia, and add the old addresses to the deny-list.
- `.env.local` files are git-ignored; never commit, paste or screenshot them.

## 6. Threat model (short)

| Threat | Control |
| --- | --- |
| Pay for rejected or unreviewed work | State machine; settlement requires `accepted` + accepting review |
| Double payout | `settlements.task_id` UNIQUE + on-chain `settled` map + idempotency keys |
| Overpay a job | Backend `withinBudget` + contract `BudgetExceeded` |
| Fake funding confirmation | Decode `JobFunded` from the escrow address; match job id, funder, amount |
| Forged Dodo webhook **[HHG]** | Verify signature; dedupe by payment id; amount must match the job |
| Leaked relayer key | Can only `settle` within funded budgets; owner can revoke the relayer |
| Leaked owner key | Kept off servers; ownership transfer on compromise |
| Contributor scrapes buyer data | Lease-scoped signed URLs, 300 s TTL, no bulk endpoints |
| Gold-answer leakage | Never serialised to contributors |
| AI reviewer manipulation (prompt in image) | Strict JSON output, enum reason codes, threshold, human fallback, appeals |
| Sybil contributors **[HHG]** | Reputation gating, wallet uniqueness, TigerGraph flags (stretch) |
| Wrong chain / stale contract | Preflight: chain id allow-list, ABI version, token address and decimals |

## 7. Supply chain **[HHG, F6.1]**

Socket GitHub app (or CLI) scans dependency changes on pull requests. `forge-std` is pinned as a
git submodule; `package-lock.json` files are committed for both apps.
