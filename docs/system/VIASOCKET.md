# viaSocket (HHG sponsor)

## A. Alerts in each user's own Slack or Discord **[live]**

**Buyer → Alerts** and **Contributor → Alerts**: a user clicks **Connect Slack** or **Connect
Discord** (viaSocket's Connect popup; viaSocket holds the OAuth), picks where Zeno posts (a channel
from their own list, or "DM me" on Slack), and which events. Code: `backend/lib/notify/apps.ts`,
routes `/api/integrations/*`, screen `src/components/product/AlertsSettings.tsx`, migration 016
(`user_app_connections`: one `auth_id` + `script_id` per user and app).

| App | Action (id, version) | Key | Who supplies it | When |
| --- | --- | --- | --- | --- |
| slack | Send Message (`row1jrbor`, V107) | `destination.messageto` | the user: "a channel" or "DM me" | once, after Connect |
| slack | | `destination.channel_id` / `destination.userId` | the user, from their own list | once, after Connect |
| slack | | `markdown_content` | Zeno, per event | per send |
| slack | | `bot_details.bot_name` | constant "Zeno" | per send |
| discord | Send Message on Channel (`rowprvu04wpv`, V6) | `channel_id` | the user, from their own list | once, after Connect |
| discord | | `message_content` / `bot_name` | Zeno per event / constant "Zeno" | per send |

The action is chosen by Zeno's code (one send action per app). Events by role: buyer —
job funded (on), label reviewed (off); contributor — label reviewed (on), payout settled (on).
Every send runs after the response and never fails the payment, review or payout that caused it.
A saved destination must be one of the user's own options (never an id typed in the browser).
Tested on real Slack and Discord connections; `viasocket-check.mjs`: 0 FAIL, 0 WARN over 10 files,
embed token accepted.

## B. Event hook to a viaSocket flow

Zeno sends four events to a viaSocket flow. The flow decides where they go (Slack, Discord, Gmail,
Google Sheets, ...), so Zeno never stores a Slack token or similar.

Code: `backend/lib/notify/viasocket.ts` (plain fetch, no SDK). Tests:
`backend/lib/notify/__tests__/viasocket.test.ts`.

## Payload

```json
{
  "event": "payout.settled",
  "occurred_at": "2026-10-29T07:00:00.000Z",
  "chain_id": 84532,
  "data": { "receipt_id": "…", "job_id": "…", "task_id": "…", "amount_usdc": "0.04",
            "tx_hash": "0x…", "is_mock": false }
}
```

| Event | `data` |
| --- | --- |
| `job.funded` | `job_id`, `amount_usdc`, `tx_hash`, `method` (`wallet` or `card`) |
| `review.decided` | `submission_id`, `task_id`, `job_id`, `decision`, `reason_code`, `reviewer_type` |
| `payout.settled` | `receipt_id`, `job_id`, `task_id`, `amount_usdc`, `tx_hash`, `is_mock` |
| `integrity.flagged` | `engine`, `flags`, then a count per signal |

Only ids, statuses and amounts: no emails, names, wallet keys or buyer data. Amounts are decimal
USDC strings (6 decimals), never floats. On Base Sepolia these are test funds.

If `VIASOCKET_WEBHOOK_SECRET` is set, each request carries
`x-zeno-signature: sha256=<hex HMAC-SHA256 of the raw body>`, so a flow step can check it.

## Behaviour

- Off unless `VIASOCKET_WEBHOOK_URL` is set.
- Sent after the HTTP response (Next.js `after`), 5 s timeout, one attempt.
- A failed delivery is logged as `[viasocket] … delivery failed` and never fails the payment,
  review or payout. A missed event can be rebuilt from the database (receipts, reviews, flags).
- `payout.settled` fires once per payout (when the task first becomes `paid`), not on a retry.

## Setup

1. Sign in at viasocket.com and create a flow (free plan: 100K tasks a month).
2. Trigger: **Webhook**. Copy the flow's webhook URL.
3. Add actions, e.g. Slack "Send message" with `{{event}}` and `{{data.amount_usdc}}`, or a
   Google Sheets row per `payout.settled`.
4. Set `VIASOCKET_WEBHOOK_URL` (and optionally `VIASOCKET_WEBHOOK_SECRET`) on the backend
   (`backend/.env.local` locally; Vercel project `zenolab-api` in production) and redeploy.
5. Trigger one event (e.g. review a submission) and check the flow's execution log.
