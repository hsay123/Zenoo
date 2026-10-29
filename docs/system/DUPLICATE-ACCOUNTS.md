# Duplicate-account detection with TigerGraph — design proposal (HHG F6.2)

**Status: built (2026-10-29).** In-process engine live; TigerGraph engine ready (schema, queries,
loader and tests) and used once `TIGERGRAPH_HOST` + `TIGERGRAPH_TOKEN` are set — not yet run against a
live TigerGraph workspace. Needs migration 013.

**As built:** `backend/lib/integrity/` (graph rules, TigerGraph adapter, service), `/tigergraph`
(GSQL schema + queries), `account_flags` table, admin routes `/api/admin/integrity/{run,flags}`,
the admin page "Integrity flags" section, and `npm run integrity:check` (dry run). Because
`users.wallet_address` is unique, "shared wallet" means a payout wallet that also funded a buyer's
job; signals built: `wallet_link`, `duplicate_work` (same label content on the same asset),
`self_dealing`, `linked_review`. Device/network signals are not built (need a privacy review).
First dry run on live data: 46 accounts, 78 submissions, 0 flags.

## Problem

Zeno pays per accepted label, gates paid work behind gold tasks (F4), and routes new or
low-accuracy contributors to human review. One person running several accounts can:

- pass gold tasks once and reuse the answers across accounts;
- farm the "first-time contributor" and reputation gates with fresh accounts;
- review or appeal their own work through a second account (the code blocks a reviewer
  reviewing their *own* account's submission, but cannot see that two accounts are one person);
- collect payouts for copy-pasted labels on several accounts.

These are relationship problems — "which accounts share something?" — which is what a graph
database answers cheaply and a row-per-table store answers awkwardly.

## Graph model

| Vertex | Key | From |
| --- | --- | --- |
| `Account` | user id | `users` |
| `Wallet` | lower-cased address | `users.wallet_address`, settlement payees |
| `Device` | hashed device/browser fingerprint | new: a salted hash sent at login (no raw fingerprint stored) |
| `Network` | hashed /24 of the request IP, per day | new: request logs (hashed, short retention) |
| `Payload` | `submissions.payload_hash` | existing |
| `GoldTask` | task id (gold only) | existing |

| Edge | Meaning |
| --- | --- |
| `Account -USES-> Wallet` | payout wallet, including past ones |
| `Account -SEEN_ON-> Device` / `Network` | logins |
| `Account -SUBMITTED-> Payload` | submission hashes |
| `Account -ANSWERED-> GoldTask` | with pass/fail and the payload hash |
| `Account -REVIEWED-> Account` | reviewer decided on that contributor's work |

## Signals (each a small GSQL query)

1. **Shared wallet:** two accounts that have ever used the same payout wallet. Strongest signal.
2. **Shared device:** two accounts with the same device hash within 30 days.
3. **Identical work:** the same non-trivial `payload_hash` from two accounts on *different* tasks,
   or identical gold answers on several gold tasks.
4. **Self-review ring:** a reviewer who shares a wallet/device cluster with the contributor whose
   work they decided or whose appeal they adjudicated.
5. **Cluster size:** connected components over signals 1–2 larger than one.

Each match produces a `flag` with the evidence path (which vertices link the accounts).

## How it plugs in (no new decision power)

- A nightly job (and an admin "re-check" button) syncs vertices/edges from Postgres and runs the
  queries; results land in a new `account_flags` table (account, signal, evidence, created_at).
- **Flags never block, reject or move money on their own.** They:
  - add a `duplicate account suspected` reason to the review router, sending that account's
    submissions to a human (the same lane as "fast submission" today);
  - exclude a flagged reviewer from deciding a flagged contributor's work;
  - appear on the admin Users page for a human decision (suspend, merge, or clear).
- An appeal path exists for false positives (shared family devices, campus networks).

## Privacy

- Store only salted hashes of device and network identifiers, never raw IPs or fingerprints.
- 30-day retention for `Device`/`Network` edges; wallet and payload edges follow the platform's
  existing records.
- Buyer data never enters the graph — only account ids, hashes and task ids.
- Disclose in the privacy policy that fraud signals are processed.

## Effort estimate (for a one-day hackathon slice)

| Piece | Est. |
| --- | --- |
| TigerGraph Savanna (free tier) workspace + schema | 1–2 h |
| Sync script (Postgres → TigerGraph REST++ upsert) for wallets, payloads, gold, reviews | 2–3 h |
| GSQL queries for signals 1, 3 and 4 (skip device/network for the demo) | 2 h |
| `account_flags` migration + router reason + admin page list | 2–3 h |

The demo slice uses only data Zeno already has (wallets, payload hashes, gold answers, reviews),
so it needs no new tracking. Device/network signals come later, after a privacy review.

## Decisions needed

1. Approve building the demo slice (signals 1, 3, 4 from existing data only)?
2. TigerGraph account/API access: who creates the Savanna workspace and holds the token?
3. Is routing flagged accounts to human review the right default (vs. only listing them)?
