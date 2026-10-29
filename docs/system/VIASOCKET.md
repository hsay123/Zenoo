# viaSocket event hook (HHG sponsor)

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
