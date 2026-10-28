"use client";

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { InlineError, InfoNote, QueryView } from "@/components/product/AsyncView";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { Receipt, Wallet } from "@/components/ui/icons";
import { useAction, useJobFunding } from "@/lib/api/live";
import {
  fundCheckoutSchema,
  fundIntentSchema,
  jobFundingSchema,
  jobSchema,
  platformPaths,
} from "@/lib/api/platform";
import { sendAndWait, WalletTxError, type Eip1193Provider } from "@/lib/funding/wallet";
import { appChain } from "@/lib/privy/config";
import { formatCount, formatUsdc } from "@/lib/utils/format";

/** Poll while a returning card payment is being turned into escrow funding. */
const POLL_MS = 4_000;
const POLL_LIMIT = 30;

/**
 * Buyer funding panel (HHG F2): what the job costs, its funding status, and
 * the two ways to pay — USDC from a wallet (approve + fundJob), or card/UPI
 * through Dodo Payments (test mode), after which the platform funds escrow.
 * Tasks are only claimable by contributors once the job is funded.
 */
export function JobFunding({
  jobId,
  jobStatus,
  onFunded,
}: {
  jobId: string;
  jobStatus: string;
  onFunded?: () => void;
}) {
  const query = useJobFunding(jobId);
  const { run, pending, error, setError } = useAction();
  const { wallets } = useWallets();
  const [stage, setStage] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);

  const data = query.status === "ready" ? query.data : null;
  const returningFromCheckout =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("payment") === "return";
  const awaitingCard =
    data !== null &&
    data.display_status !== "funded" &&
    data.payment !== null &&
    ["created", "paid", "funding"].includes(data.payment.status) &&
    (returningFromCheckout || data.payment.status !== "created");

  // After returning from checkout, refresh until the webhook has been applied.
  useEffect(() => {
    if (!awaitingCard || polls >= POLL_LIMIT) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      query.reload();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [awaitingCard, polls, query]);

  useEffect(() => {
    if (data?.display_status === "funded") onFunded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.display_status]);

  const fundFromWallet = async () => {
    setStage(null);
    const result = await run(async (client) => {
      let funding = data ?? (await client.get(jobFundingSchema, platformPaths.jobFunding(jobId)));
      const recorded = funding.wallet_tx?.funding_wallet_address?.toLowerCase();
      const wallet =
        (recorded && wallets.find((w) => w.address.toLowerCase() === recorded)) || wallets[0];
      if (!wallet) throw new WalletTxError("Connect a wallet to fund this job.");

      if (funding.funding_status === "unfunded") {
        setStage("Recording your funding wallet…");
        await client.post(fundIntentSchema, platformPaths.fundJob(jobId), {
          body: { funding_wallet_address: wallet.address },
        });
        funding = await client.get(jobFundingSchema, platformPaths.jobFunding(jobId));
      }
      const tx = funding.wallet_tx;
      if (!tx) throw new WalletTxError("This job is not awaiting a wallet funding.");
      if (tx.funding_wallet_address.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new WalletTxError(
          `This job's funding was started from ${tx.funding_wallet_address}. Connect that wallet to continue.`,
        );
      }

      setStage(`Switching to ${appChain.name}…`);
      await wallet.switchChain(funding.chain.chain_id);
      const provider = (await wallet.getEthereumProvider()) as Eip1193Provider;

      setStage("Approve USDC in your wallet…");
      await sendAndWait(provider, wallet.address, tx.approve);
      setStage("Confirm the escrow deposit in your wallet…");
      const fundHash = await sendAndWait(provider, wallet.address, tx.fund);

      setStage("Verifying the deposit…");
      return client.post(jobSchema, platformPaths.fundJobConfirm(jobId), {
        body: { tx_hash: fundHash },
      });
    });
    setStage(null);
    query.reload();
    if (result) onFunded?.();
  };

  const payByCard = async () => {
    setStage(null);
    setError(null);
    const checkout = await run((client) =>
      client.post(fundCheckoutSchema, platformPaths.fundJobCheckout(jobId), {
        idempotencyKey: `checkout:${jobId}:${Date.now()}`,
      }),
    );
    if (checkout) window.location.assign(checkout.checkout_url);
  };

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-6">
      <QueryView query={query} loadingLabel="Loading funding">
        {(funding) => {
          const canFund =
            jobStatus === "published" &&
            (funding.display_status === "unfunded" ||
              (funding.display_status === "pending" && funding.wallet_tx !== null));
          const feePercent = funding.quote.fee_bps / 100;
          const explorer = appChain.blockExplorers.default.url;
          const fundingTx = funding.payment?.funding_tx_hash ?? null;

          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-title text-ink">Funding</h2>
                <StatusChip status={`funding_${funding.display_status}`} />
              </div>
              <p className="mt-1.5 text-body-sm text-ink-3">
                Tasks become claimable once the job&apos;s escrow is funded.
                Contributors are paid from escrow only for accepted work.
              </p>

              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    Escrow budget
                  </dt>
                  <dd className="mt-1 font-display text-[1.25rem] text-ink tnum">
                    {formatUsdc(funding.quote.payout)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    Zeno fee ({feePercent}% of total)
                  </dt>
                  <dd className="mt-1 font-display text-[1.25rem] text-ink tnum">
                    {formatUsdc(funding.quote.fee)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    You pay by card / UPI
                  </dt>
                  <dd className="mt-1 font-display text-[1.25rem] text-ink tnum">
                    {formatUsdc(funding.quote.total)}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption uppercase tracking-[0.06em] text-ink-4">
                    Tasks × reward
                  </dt>
                  <dd className="mt-1 text-body-sm text-ink-2 tnum">
                    {formatCount(funding.task_count)} × {formatUsdc(funding.reward_per_task)}
                  </dd>
                </div>
              </dl>

              {canFund ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {funding.methods.wallet ? (
                    <Button onClick={() => void fundFromWallet()} disabled={pending}>
                      <Wallet className="h-4 w-4" />
                      {funding.display_status === "pending"
                        ? "Continue wallet funding"
                        : "Fund from wallet"}
                    </Button>
                  ) : null}
                  {funding.methods.card && funding.display_status === "unfunded" ? (
                    <Button
                      variant="secondary"
                      onClick={() => void payByCard()}
                      disabled={pending}
                    >
                      <Receipt className="h-4 w-4" />
                      Pay by card / UPI
                    </Button>
                  ) : null}
                  {!funding.methods.wallet && !funding.methods.card ? (
                    <span className="text-caption text-ink-4">
                      Funding is not configured on this deployment yet.
                    </span>
                  ) : null}
                </div>
              ) : null}

              {jobStatus !== "published" && funding.display_status === "unfunded" ? (
                <p className="mt-4 text-caption text-ink-4">
                  Publish the job before funding it.
                </p>
              ) : null}

              {stage ? (
                <p className="mt-3 text-caption text-ink-3" role="status">
                  {stage}
                </p>
              ) : null}
              {error ? (
                <div className="mt-3">
                  <InlineError error={error} />
                </div>
              ) : null}

              {funding.display_status === "paid_awaiting_funding" ? (
                <InfoNote>
                  Your card payment was received. Zeno funds this job&apos;s escrow
                  in USDC on {appChain.name}
                  {funding.methods.card_auto_funding
                    ? "; this usually takes under a minute."
                    : " once the platform treasury processes it."}{" "}
                  Tasks open to contributors when funding is confirmed.
                </InfoNote>
              ) : null}
              {funding.display_status === "funded" && fundingTx ? (
                <InfoNote>
                  Escrow funded on {appChain.name}:{" "}
                  <a
                    href={`${explorer}/tx/${fundingTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[12px] underline hover:text-ink-2"
                  >
                    {fundingTx.slice(0, 10)}…{fundingTx.slice(-8)}
                  </a>
                </InfoNote>
              ) : null}
              <InfoNote>
                Test mode: amounts are test USDC on {appChain.name}, and card / UPI
                payments run through Dodo Payments&apos; test environment. No real
                money moves. The fee applies to card / UPI payments; wallet funding
                deposits the escrow budget only.
              </InfoNote>
            </>
          );
        }}
      </QueryView>
    </section>
  );
}
