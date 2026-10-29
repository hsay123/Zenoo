# CLAUDE.md — Zeno, HHG 2026 build

Build context for Claude Code. Read `ARCHITECTURE.md` and `docs/PRD.md` first.
Also follow `AGENTS.md` (Next.js 16: read `node_modules/next/dist/docs/` before writing Next code).

## What Zeno is
A self-serve data-labeling marketplace. Buyers upload raw data and post jobs; contributors label
inside Zeno's workspace (no downloads); reviewers accept or reject; escrow pays contributors only
for accepted labels, with an on-chain receipt per payout. Job types: `image-boxes-v1`,
`action-segments-v1`.

Stack: Next.js frontend (root) + API-only Next.js backend (`/backend`), Supabase Postgres, Privy
login, Foundry contract `contracts/src/JobEscrow.sol`.

Event: Hacker House Goa 2026 (AI × Crypto, Oct 28–31, demo day with on-chain voting).

## Ground rules
- Zeno was built earlier for a Monad hackathon. README must have a "Prior work" section;
  everything from 2026-10-28 onward (branch `hhg-base-usdc`) is HHG work. Never rewrite history
  to hide this.
- Do not move real funds until the open items in `docs/AUDIT-2026-10.md` are confirmed fixed and
  all keys are rotated. The key from earlier development is compromised.
- Small, tested changes. After each change run the checks below for the parts you touched.
- No floating-point money. USDC has 6 decimals: `parseUnits(amount, 6)`, never `parseEther`.
- Anything mocked is labelled as mocked in the UI.

## Checks
```bash
cd contracts && forge test
cd backend && npm run typecheck && npm run lint && npm test && npm run build
npx tsc --noEmit && npm run lint && npm test && npm run build      # repo root
```

## Priority tasks (PRD §5)
1. F1 (P0) Monad/MON → Base Sepolia/USDC: contract, backend chain + decimals, fund confirm,
   Privy chains + WalletConnect, UI labels, env/docs/e2e.
2. F2 (P0) Buyer funding UI: wallet (approve + fundJob) and Dodo Payments test mode.
3. F3 (P0) Real AI reviewer behind the `AiReviewer` interface; threshold routing; fail safe.
4. F4 (P1) Contributor reputation and tiers.
5. F5 (P2) Royalty split demo contract 50/30/20.
6. F6 (P2) Socket; TigerGraph if time allows; Cake Wallet in onboarding.

Out of scope: audio/text/3D jobs, a dataset library / licensed third-party data, multiple chains,
new job types. (A read-only Data API over the buyer's own accepted labels was added on
2026-10-29 at the user's request: `docs/system/DATA-API.md`.)

## Business facts (for copy)
- 20% commission on accepted labels (contributor keeps 80%).
- Starting price: $0.05 per accepted box to the buyer, $0.04 to the contributor.
- Buyer data is private by default and belongs to the buyer.

## System docs
`ARCHITECTURE.md`, `docs/system/DATA-MODEL.md`, `docs/system/MONEY-FLOW.md`,
`docs/system/QUALITY-PIPELINE.md`, `docs/system/AUTH-AND-SECURITY.md`. Keep them current when a
change alters what they describe (flip **[HHG]** markers to **[live]**).
