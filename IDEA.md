# Zeno — Idea Overview

> Verified labeled data for anyone building AI. Buyers pay only for labels that pass review;
> contributors are paid in seconds, anywhere in the world.

Built for Hacker House Goa 2026 (AI × Crypto). Zeno's core marketplace was first built for a
Monad hackathon; see "Prior work" below.

---

## 1. The problem

**For teams building AI:** every vision or robotics model needs labeled data, and getting it is hard
for small teams.

- Big vendors such as Scale AI sell large managed contracts to big labs. A 10-person startup with a
  2,000-image job is not their customer.
- Labeling tools such as Labelbox still need you to bring and manage your own workforce.
- Freelance sites such as Fiverr give you one person's time, with no per-label quality check, and your
  data ends up on strangers' laptops.
- Quality is a real problem: industry estimates put fraud in online research data at 15–30%, and an
  LLM-based fake respondent has passed 99.8% of standard quality checks.

**For the people who label data:** pay is slow, opaque and hard to receive across borders. Small
per-task payments get eaten by bank and gateway fees.

## 2. The solution

Zeno is a self-serve marketplace that turns raw data into verified labels.

1. A buyer uploads raw images or video and posts a job, paying by card or UPI.
2. Zeno splits the job into small tasks and routes them to contributors.
3. Contributors label **inside Zeno's workspace**: no downloads, same tools, same rules.
4. Every label is checked: gold tasks, too-fast flags, AI first pass, human review, appeals.
5. Escrow pays the contributor **only when a label is accepted**, in USDC, with an on-chain receipt.
6. The buyer exports only accepted labels in standard formats.

## 3. Who it's for

**Buyers (who pay):** anyone who needs labeled data. Launch order:

1. AI startups, hackathon teams, university labs (now)
2. Robotics/physical-AI startups and Indian vertical AI: agriculture, retail, traffic (months 2–4)
3. Mid-size companies and data-API buyers (months 6+)
4. Expert domains such as healthcare (later, with certified labelers and compliance)

**Contributors (who earn):** students, gig workers, domain experts (farmers, mechanics, retail staff)
and crypto-native workers worldwide.

## 4. Why Zeno wins

| Compared with | Zeno's edge |
| --- | --- |
| Scale AI | Self-serve for small teams; neutral (no big-tech shareholder) |
| Labelbox and other tools | Comes with a vetted workforce, not just software |
| Fiverr / Upwork | Verified labels per item, split across many people, data never leaves the workspace |
| MTurk / Toloka | Built for physical-world video, escrow pays only on acceptance, public receipts |

## 5. Why web3

If every buyer and contributor were in India, UPI would be simpler. Zeno is built for a global
workforce paid per label, and that's where stablecoins win:

1. **Global payouts:** USDC lands anywhere in seconds; cross-border bank payouts are slow and costly.
2. **Micropayments:** a $0.04 label can't survive gateway fees; an on-chain transfer can.
3. **Escrow in code:** the job budget is locked when funded and released per accepted task.
4. **Public proof:** each payout has an on-chain receipt tied to the label's hash.
5. **Royalties:** data API sales split automatically between data owners and contributors.

Buyers never touch crypto (they pay through Dodo Payments); contributors can cash out to rupees.

## 6. Business model

| Stream | How Zeno earns | When |
| --- | --- | --- |
| Marketplace commission | 20% of each accepted label; contributor keeps 80% | Now |
| Pro plan | Subscription: private reviewers, custom schemas, quality dashboards | Months 2–4 |
| Data API | Pay per item or dataset; opt-in data with royalties | Months 6+ |
| Enterprise | Dedicated workforce, contracts, SLAs | Year 2 |

Starting price (assumption to test): $0.05 per accepted image box to the buyer, $0.04 to the
contributor. Public market rates for simple boxes run about $0.015–$0.10.

Data API royalty split (starting proposal): 50% Zeno, 30% data owner, 20% contributors. Buyer data
is private by default and belongs to the buyer; only opt-in data is resold.

## 7. Sponsor integrations (HHG 2026)

| Sponsor | Role in Zeno |
| --- | --- |
| Dodo Payments | Buyers fund jobs by card/UPI |
| Cake Wallet | Contributors receive USDC on Base |
| TigerGraph | Duplicate/fake-account detection; royalty lineage graph |
| Socket | Dependency scanning on the money-moving codebase |
| Wispr Flow | Contributors can dictate video labels and notes |
| AI Grants India | Funding for first contributor payouts (application) |

## 8. Market

Grand View Research forecasts data labeling solutions and services to reach about $57.6 billion by
2030, growing about 20% a year. (Tool-only reports give much smaller figures.)

## 9. Prior work

Zeno's core marketplace (auth, roles, jobs, tasks, review, appeals, receipts, exports, and the
escrow contract on Monad testnet) was built before HHG 2026 for a Monad hackathon. Work committed
from 2026-10-28 onward is the HHG build: the move to Base/USDC, buyer funding through Dodo, a real AI
reviewer, contributor reputation, and the royalty split.

## Sources

- Grand View Research via GII — data labeling solutions and services market:
  https://gii.tw/report/grvi1609573-data-labeling-solution-services-market-size-share.html
- BasicAI — image annotation pricing benchmark: https://www.basic.ai/blog-post/image-annotation-services-cost
- NORC — survey fraud literature review:
  https://www.norc.org/content/dam/norc-org/pdf2026/cpss-research-brief-fraud-lit-review.pdf
- Storyboard18 — Google and Scale AI after the Meta stake:
  https://www.storyboard18.com/how-it-works/google-to-sever-ties-with-scale-ai-following-metas-significant-stake-70359.htm
- Cake Wallet — Base network support: https://docs.cakewallet.com/cryptos/base
