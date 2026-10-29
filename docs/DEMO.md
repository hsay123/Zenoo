# Zeno — demo day script (HHG 2026, Oct 31)

Live: **https://zenolab.vercel.app** · API: **https://zenolab-api.vercel.app** · chain: Base Sepolia
(test USDC). Everything below is **test mode**: no real money moves.

## The story in one line

Startups need labeled data to train models; Zeno lets them post raw images or video, pays
contributors in USDC **only for labels a reviewer accepted** (on-chain receipt per payout), and
then serves those labels straight into training code through an API.

## Before the demo (do once, the night before)

| # | Step | Who |
| --- | --- | --- |
| 1 | Sign in to https://zenolab.vercel.app as the demo **company** ("robotics studio"). Check **Buyer → API** shows **Active**. | You |
| 2 | **New job** → image, 6 images from a real robotics/warehouse set, labels `cup, hand, box, other`, reward **0.10**, budget **0.60** → publish → **Pay by card** (Dodo test card `4242 4242 4242 4242`, 06/32, 123; India: `4576 2389 1277 1450`). Job shows **Funded**. | You |
| 3 | Label and accept those 6 tasks with the contributor and reviewer test accounts (each payout settles on Base Sepolia). | Claude (test accounts) |
| 4 | **Buyer → API** → create key `demo` → keep it in a terminal: `export ZENO_API_KEY=…` | You |
| 5 | Open these tabs, signed in: company job page, contributor workspace (second browser or phone), reviewer queue, one payout receipt, Basescan for the escrow `0xa4B1053d0878Ae2b86640A547E125BEB20456962`, a terminal. | You |
| 6 | Run the pre-flight below. | You or Claude |

### Pre-flight (5 minutes before)

```bash
curl -s https://zenolab-api.vercel.app/api/health                      # {"status":"ok"}
curl -s -H "Authorization: Bearer $ZENO_API_KEY" \
  https://zenolab-api.vercel.app/api/v1/datasets | head -c 300          # your datasets
```

- First sign-in on a cold browser takes about 6 s ("Verifying your session…"): sign in to every tab
  beforehand.
- Venue Wi-Fi: keep a phone hotspot ready; the app needs Privy, Supabase and the Base RPC.

## The 3-minute demo

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Landing page | "Robotics and vision teams spend weeks getting labeled data. Zeno: post raw data, pay only for accepted labels, get them back as an API." |
| 0:20 | **Company → New job**: upload 2 images, pick labels, budget → publish | "A company posts a job. Their data stays private." |
| 0:40 | **Funding** card → *Pay by card* → Dodo test checkout (show ₹ price for India) → **Funded** | "Pay by card or UPI through Dodo; our treasury locks USDC in escrow on Base. Or fund straight from a wallet." |
| 1:00 | **Contributor workspace** → task appears → claim → draw boxes → submit | "Contributors label inside Zeno; the raw data is never downloaded." |
| 1:30 | **Reviewer** → accept | "Only accepted work is paid. Accepting triggers the payout…" |
| 1:45 | **Receipt** page → Basescan tx | "…an on-chain USDC transfer from escrow, with a public receipt that ties the payout to the exact label and review." |
| 2:05 | Terminal: `curl …/labels?format=yolo&split=train:0.8,val:0.2&media=signed_url` | "And a startup on the $299 API plan pulls those labels straight into training: YOLO, COCO or JSON, filtered and split, no bulk download." |
| 2:35 | `/developers` page, then close | "Built this week on Base, Dodo Payments, TigerGraph for fraud checks, viaSocket, Cake Wallet payouts. Vote for Zeno." |

## If something breaks

| Problem | Do this |
| --- | --- |
| Sign-in spins | Wait 10 s, then **Reload** (the page offers it after 15 s). Tabs signed in beforehand avoid it. |
| Card checkout slow | Show the already-funded job from step 2 instead. |
| Payout slow on chain | Open the receipt of an earlier payout from **Contributor → Earnings**. |
| No network | Fall back to the recorded walkthrough (record one the night before). |

## Talking points (if asked)

- **Business:** 20% commission on accepted labels (contributor keeps 80%); the Data API is a
  $299/month plan.
- **Quality:** gold tasks, reputation tiers (New → Verified → Trusted → Reviewer), AI first pass
  with human fallback, appeals.
- **Integrity:** TigerGraph finds linked accounts (shared wallets, duplicate work) and blocks
  self-review.
- **Trust:** money is never floating point (USDC 6 decimals), escrow pays only accepted work,
  every payout has a public receipt.
- **Prior work:** Zeno started at a Monad hackathon; everything since Oct 28 (Base/USDC, card
  funding, AI review, reputation, royalties demo, TigerGraph, Data API) is HHG work. See README.
