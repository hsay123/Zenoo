# Zeno — Product Requirements Document (HHG 2026 build)

| | |
| --- | --- |
| Product | Zeno: verified data-labeling marketplace |
| Version | HHG 2026 build (v0.2) |
| Date | 2026-10-28 |
| Event | Hacker House Goa 2026, demo day Oct 31 |
| Status | Draft |

Companion docs: `IDEA.md` (what and why), `CLAUDE.md` (build context for Claude Code).

---

## 1. Summary

Zeno lets anyone who needs labeled data post a job, have it labeled by a vetted crowd inside Zeno's
workspace, and pay only for labels that pass review. Contributors are paid in USDC on Base when
their work is accepted, with an on-chain receipt.

This PRD covers the work for HHG 2026: complete the money loop with real payouts, add buyer funding,
replace the mock AI reviewer, and add contributor reputation, plus a demo of the royalty split.

## 2. Goals and non-goals

**Goals (by demo day)**

1. One complete, real loop: job funded → tasks labeled → reviewed → accepted → contributor paid in USDC on-chain → buyer exports.
2. Buyers can fund a job without holding crypto.
3. Quality is visible: AI first pass, gold scores, reputation shown in the product.
4. Real usage at HHG: at least 2 buyer jobs and 20+ paid contributors.

**Non-goals (this week)**

- Audio, text or 3D job types
- The full data API and dataset library (royalty split is demo-only)
- Multiple chains
- Enterprise features (SLAs, invoicing, private workforces)

## 3. Users and roles

| Role | Who | Main need |
| --- | --- | --- |
| Buyer | AI startups, hackathon teams, labs | Get verified labels fast, pay only for good work, keep data private |
| Contributor | Students, gig workers, domain experts | Clear tasks, fair pay, fast payout |
| Reviewer | Trusted contributors / staff | Efficient queue to accept, revise or reject |
| Admin | Zeno team | Manage users, roles, settlements, disputes |

Login is through Privy for all roles. Contributors can connect an external wallet (Cake Wallet via
WalletConnect) or use a Privy embedded wallet from email login.

## 4. What already exists (prior work)

Built before HHG for a Monad hackathon; keep and do not regress:

- Privy auth, onboarding, role guards (`requireRole`)
- Projects, assets (private storage), jobs, tasks with leases, drafts, submissions
- Image boxes and video action-segment editors (native)
- Gold-task scoring (IoU for boxes, label + timing for segments), too-fast submission flag
- Review queue, decisions, appeals
- Receipts and accepted-only exports
- `JobEscrow` contract (native MON, Monad testnet) with Foundry tests
- Mock settlement and mock AI reviewer

## 5. Requirements

Priority: **P0** must ship for demo day · **P1** should ship · **P2** demo or stretch.

### F1. Base + USDC escrow and payouts (P0)

Move from Monad testnet / native MON to Base (Base Sepolia for development) / USDC.

| ID | Requirement |
| --- | --- |
| F1.1 | `JobEscrow` holds an ERC-20 token set at deploy time (USDC). |
| F1.2 | `fundJob(jobId, amount)` pulls USDC via `transferFrom`; the first funder is the recorded buyer; only they may top up. |
| F1.3 | `settle` pays the contributor in USDC; a task settles at most once; total paid never exceeds budget; only relayers may settle. |
| F1.4 | `closeJob` and `withdraw` keep current rules (no withdrawal while a job is open). |
| F1.5 | All amounts use 6 decimals (`parseUnits(amount, 6)`); no floating-point money anywhere. |
| F1.6 | Backend chain, RPC and escrow address come from env (`CHAIN_ID`, `RPC_URL`, `JOB_ESCROW_ADDRESS`). |
| F1.7 | A receipt is marked real only after a successful receipt and a matching `TaskSettled` event (existing rule). |
| F1.8 | Privy is configured for Base / Base Sepolia, with WalletConnect enabled. |
| F1.9 | All UI labels show USDC, not MON. |

**Acceptance:** Foundry tests pass for every rule above; backend tests pass; an e2e run on Base
Sepolia funds a job, settles one accepted task, and shows the transaction on the block explorer.

### F2. Buyer funding (P0)

| ID | Requirement |
| --- | --- |
| F2.1 | New Job Wizard includes a funding step showing budget = tasks × reward + Zeno fee. |
| F2.2 | Buyers can pay by card/UPI through Dodo Payments (test mode for the demo). |
| F2.3 | On a successful Dodo payment (webhook), the platform funds the job's escrow in USDC and records the funding tx. |
| F2.4 | Crypto-native buyers can instead fund directly from their wallet (approve + `fundJob`). |
| F2.5 | Only funded jobs show tasks to contributors (existing backend filter). |
| F2.6 | Buyer dashboard shows funding status: unfunded, pending, funded, closed. |

**Acceptance:** a buyer pays in Dodo test mode, the job becomes funded, and tasks appear for contributors.

### F3. Real AI reviewer (P0)

| ID | Requirement |
| --- | --- |
| F3.1 | Replace `MockAiReviewer` with a real model call behind the same `AiReviewer` interface. |
| F3.2 | Output keeps the current shape: decision, reason code, confidence, notes, rubric version. |
| F3.3 | Only decisions above `AI_CONFIDENCE_THRESHOLD` auto-apply; others go to the human queue. |
| F3.4 | If the model call fails or times out, the submission goes to human review (fail safe). |
| F3.5 | Video stays human-reviewed by default this week. |

**Acceptance:** image submissions get a real AI decision in the review record; failures route to humans.

### F4. Contributor reputation (P1)

| ID | Requirement |
| --- | --- |
| F4.1 | Each contributor has a score from gold-task accuracy and acceptance rate. |
| F4.2 | Tiers: New → Verified → Trusted → Reviewer; thresholds configurable. |
| F4.3 | New contributors see practice and gold tasks only; video tasks need Trusted. |
| F4.4 | Score and tier show on the contributor's earnings page. |

**Acceptance:** a new account cannot claim paid tasks until it passes gold tasks; tier changes as accuracy changes.

### F5. Royalty split demo (P2)

| ID | Requirement |
| --- | --- |
| F5.1 | A small contract splits one USDC payment: 50% Zeno, 30% data owner, 20% contributors (split configurable). |
| F5.2 | One demo endpoint simulates a data-API purchase and triggers the split. |
| F5.3 | Clearly labeled "roadmap demo" in the UI and pitch. |

### F6. Sponsor touches (P2)

| ID | Requirement |
| --- | --- |
| F6.1 | viaSocket (HHG sponsor): Zeno events (funded, reviewed, paid, flagged) go to a viaSocket flow via webhook. *(Changed 2026-10-29 from Socket.dev dependency scanning.)* |
| F6.2 | TigerGraph: flag accounts sharing wallets, devices or near-identical submissions (if time allows). |
| F6.3 | Cake Wallet shown as a supported payout wallet in onboarding. |

## 6. Non-functional requirements

**Security**
- Do not move real funds until the items in `docs/AUDIT-2026-10.md` are confirmed fixed and all keys are rotated.
- Owner and relayer keys are separate; the relayer key lives server-side only.
- `DEV_AUTH_BYPASS` stays refused in production.

**Privacy**
- Buyer data is private by default and belongs to the buyer.
- Contributors see only tasks they've claimed, for the lease window; no bulk downloads.
- Exports and receipts contain no contributor identity.

**Reliability**
- Settlement records a pending attempt before broadcasting and reconciles by tx hash after a crash.
- Every payout is idempotent per (task, submission).

**Transparency**
- README has a "Prior work" section; HHG work is the commits from 2026-10-28 onward.
- The UI labels anything mocked as mocked.

## 7. Success metrics

| Metric | Demo-day target |
| --- | --- |
| Buyer jobs completed | ≥ 2 |
| Contributors paid in USDC | ≥ 20 |
| Accepted labels | ≥ 500 |
| Acceptance rate | Report the real number |
| Time from job posted to export | Report the real number |
| Buyers saying they would pay for the next batch | ≥ 1, with a price |

## 8. Milestones

| When | Deliverable |
| --- | --- |
| Oct 28 (night) | Organiser answer on prior work; keys rotated; audit items checked; 10 team interviews |
| Oct 29 | F1 contract + backend on Base Sepolia; F3 real AI reviewer; full loop run by the team |
| Oct 30 | F2 buyer funding; F4 reputation; live job with HHG builders |
| Oct 31 (morning) | F5 demo; code freeze; backup demo video; Q&A rehearsal |

## 9. Open questions

1. Does HHG allow bringing pre-built code if declared? (Blocks how we present.)
2. Does Cake Wallet support Base Sepolia, or only Base mainnet? (Decides the live payout demo.)
3. How will the platform hold the USDC float to fund escrow after a Dodo fiat payment, and what rules apply?
4. Which AI model for the first-pass reviewer, and at what cost per image?
5. Video pricing per minute: what will the first buyers accept?
6. Which sponsors run bounties, and what does each require?

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| USDC decimal bug overpays or underpays | 6-decimal tests at contract, backend and UI layers |
| Testnet or wifi fails on stage | Pre-recorded backup demo video |
| Too few real users in time | Seed jobs with free credits; recruit in the HHG chat on day 2 |
| Rule violation on prior work | Ask organisers first; disclose clearly |
| AI reviewer is wrong | Confidence threshold + human queue + appeals |
