"use client";

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { InlineError, InfoNote, QueryView } from "@/components/product/AsyncView";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { Receipt, Wallet } from "@/components/ui/icons";
import { useAction, useJobFunding } from "@/lib/api/live";
import {
  faucetGrantSchema,
  fundCheckoutSchema,
  fundIntentSchema,
  jobFundingSchema,
  jobSchema,
  platformPaths,
} from "@/lib/api/platform";
import {
  MIN_GAS_WEI,
  friendlyWalletError,
  readWalletBalances,
  sendAndWait,
  WalletTxError,
  type Eip1193Provider,
  type WalletBalances,
} from "@/lib/funding/wallet";
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
/** USDC base units (6 decimals) to a decimal string, without floats. */
function formatUnits6(units: bigint): string {
  const whole = units / BigInt(1_000_000);
  const frac = (units % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Wei to a short ETH figure for display only (never used for money math). */
function formatEth(wei: bigint): string {
  const micro = wei / BigInt(1_000_000_000_000); // 1e-6 ETH
  return (Number(micro) / 1_000_000).toFixed(micro > BigInt(0) && micro < BigInt(100) ? 6 : 4);
}

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

  // The wallet that would pay: the one already recorded for this job, else the
  // signed-in one (an email sign-up gets an embedded Privy wallet, which starts
  // empty). Its balances decide whether wallet funding is offered at all.
  const recordedWallet = data?.wallet_tx?.funding_wallet_address?.toLowerCase();
  const payingWallet =
    (recordedWallet && wallets.find((w) => w.address.toLowerCase() === recordedWallet)) || wallets[0] || null;
  const payingAddress = payingWallet?.address ?? null;
  const tokenAddress = data?.chain.token_address ?? null;
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balanceCheck, setBalanceCheck] = useState(0);
  useEffect(() => {
    if (!payingAddress || !tokenAddress) return;
    let active = true;
    readWalletBalances(appChain.rpcUrls.default.http[0], tokenAddress, payingAddress)
      .then((b) => active && setBalances(b))
      .catch(() => active && setBalances(null));
    return () => {
      active = false;
    };
  }, [payingAddress, tokenAddress, balanceCheck]);
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

      const send = async (request: typeof tx.approve) => {
        try {
          return await sendAndWait(provider, wallet.address, request);
        } catch (cause) {
          const friendly = friendlyWalletError(cause);
          throw friendly ? new WalletTxError(friendly) : cause;
        }
      };
      setStage("Approve USDC in your wallet…");
      await send(tx.approve);
      setStage("Confirm the escrow deposit in your wallet…");
      const fundHash = await send(tx.fund);

      setStage("Verifying the deposit…");
      return client.post(jobSchema, platformPaths.fundJobConfirm(jobId), {
        body: { tx_hash: fundHash },
      });
    });
    setStage(null);
    query.reload();
    if (result) onFunded?.();
  };

  // Testnet only: top up the buyer's own wallet with what this job needs.
  const getTestFunds = async () => {
    if (!payingAddress) return;
    setError(null);
    setStage("Sending test USDC and gas to your wallet…");
    const grant = await run((client) =>
      client.post(faucetGrantSchema, platformPaths.fundJobFaucet(jobId), { body: { address: payingAddress } }),
    );
    if (!grant || !tokenAddress || !data) {
      setStage(null);
      return;
    }
    // The transfers are broadcast; wait until the wallet's balance shows them.
    setStage("Waiting for Base Sepolia to confirm your test funds…");
    const need = BigInt(data.quote.payout_units);
    for (let i = 0; i < 45; i += 1) {
      const fresh = await readWalletBalances(appChain.rpcUrls.default.http[0], tokenAddress, payingAddress).catch(
        () => null,
      );
      if (fresh && fresh.tokenUnits >= need && fresh.gasWei >= MIN_GAS_WEI) {
        setBalances(fresh);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    setStage(null);
    setBalanceCheck((n) => n + 1);
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
          const needUnits = BigInt(funding.quote.payout_units);
          const walletShort = balances
            ? balances.tokenUnits < needUnits
              ? "usdc"
              : balances.gasWei < MIN_GAS_WEI
                ? "gas"
                : null
            : null;
          const walletCanPay = funding.methods.wallet && balances !== null && walletShort === null;
          const cardAvailable = funding.methods.card && (funding.methods.card_available ?? true);
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
                <>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    {funding.methods.card && funding.display_status === "unfunded" ? (
                      <Button
                        variant={walletCanPay ? "secondary" : "primary"}
                        onClick={() => void payByCard()}
                        disabled={pending || !cardAvailable}
                      >
                        <Receipt className="h-4 w-4" />
                        Pay by card / UPI
                      </Button>
                    ) : null}
                    {funding.methods.wallet ? (
                      <Button
                        variant={walletCanPay ? "primary" : "secondary"}
                        onClick={() => void fundFromWallet()}
                        disabled={pending || !walletCanPay}
                      >
                        <Wallet className="h-4 w-4" />
                        {funding.display_status === "pending"
                          ? "Continue wallet funding"
                          : "Fund from wallet"}
                      </Button>
                    ) : null}
                    {!funding.methods.wallet && !funding.methods.card ? (
                      <span className="text-caption text-ink-4">
                        Funding is not configured on this deployment yet.
                      </span>
                    ) : null}
                  </div>

                  {funding.methods.card && !cardAvailable && funding.methods.card_unavailable_reason ? (
                    <p className="mt-3 text-caption text-ink-3">{funding.methods.card_unavailable_reason}</p>
                  ) : null}

                  {funding.methods.wallet ? (
                    <div className="mt-4 rounded-lg border border-line bg-surface-muted p-4 text-body-sm">
                      {payingAddress ? (
                        <>
                          <p className="text-ink-2">
                            Your wallet{" "}
                            <code className="font-mono text-[12px] text-ink">
                              {payingAddress.slice(0, 6)}…{payingAddress.slice(-4)}
                            </code>{" "}
                            <button
                              type="button"
                              className="text-caption underline hover:text-ink"
                              onClick={() => void navigator.clipboard.writeText(payingAddress)}
                            >
                              copy
                            </button>
                            {balances ? (
                              <>
                                {" "}· {formatUsdc(formatUnits6(balances.tokenUnits))} ·{" "}
                                {formatEth(balances.gasWei)} ETH for gas
                              </>
                            ) : (
                              " · checking balance…"
                            )}
                          </p>
                          {walletShort ? (
                            <p className="mt-2 text-ink-3">
                              {walletShort === "usdc"
                                ? `This wallet needs ${formatUsdc(funding.quote.payout)} (test funds) to fund the escrow.`
                                : "This wallet has no Base Sepolia ETH for the network fee."}{" "}
                              {appChain.id === 84532 ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="ml-1"
                                    onClick={() => void getTestFunds()}
                                    disabled={pending}
                                  >
                                    Get free test funds
                                  </Button>{" "}
                                  (Base Sepolia test USDC and gas, sent to this wallet) or add your own:{" "}
                                </>
                              ) : cardAvailable ? (
                                "Pay by card instead, or add funds: "
                              ) : (
                                "Add funds: "
                              )}
                              <a className="underline" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                                test USDC
                              </a>{" "}
                              ·{" "}
                              <a
                                className="underline"
                                href="https://docs.base.org/base-chain/tools/network-faucets"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Base Sepolia ETH
                              </a>{" "}
                              ·{" "}
                              <button type="button" className="underline" onClick={() => setBalanceCheck((n) => n + 1)}>
                                check again
                              </button>
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-ink-3">
                          No wallet is connected to this account yet, so pay by card, or sign in with a wallet.
                        </p>
                      )}
                    </div>
                  ) : null}
                </>
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
