"use client";

import { useEffect, useState } from "react";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { useSession } from "@/lib/api/session";
import { useAction } from "@/lib/api/live";
import { meSyncSchema, payoutWalletSchema, platformPaths } from "@/lib/api/platform";
import { InlineError, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { readWalletBalances, type WalletBalances } from "@/lib/funding/wallet";
import { appChain, appUsdc } from "@/lib/privy/config";
import { formatUsdc } from "@/lib/utils/format";

/** USDC base units (6 decimals) to a decimal string, without floats. */
function units6(units: bigint): string {
  const whole = units / BigInt(1_000_000);
  const frac = (units % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Wei to a short ETH figure, display only. */
function eth(wei: bigint): string {
  const micro = wei / BigInt(1_000_000_000_000);
  return (Number(micro) / 1_000_000).toFixed(6);
}

type LinkedWallet = { address: string; walletClientType?: string; connectorType?: string };

/** Privy's client ids ("brave_wallet", "cake_wallet") as names people know. */
function walletName(clientType?: string): string {
  if (!clientType) return "External wallet";
  const known: Record<string, string> = { metamask: "MetaMask", wallet_connect: "WalletConnect", coinbase_wallet: "Coinbase Wallet" };
  return known[clientType] ?? clientType.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Account: the sign-in email (or a way to add one), every wallet linked to the
 * account with its balance, linking another wallet (Cake Wallet, MetaMask, …)
 * and choosing which one receives payouts. Linking is Privy's own flow; the
 * server re-reads Privy and only accepts the account's own wallets.
 */
export function AccountSettings({ eyebrow }: { eyebrow: string }) {
  const { user: session } = useSession();
  const { user } = usePrivy();
  const { run, pending, error } = useAction();
  const [email, setEmail] = useState(session.email);
  const [payout, setPayout] = useState(session.wallet_address?.toLowerCase() ?? null);
  const [balances, setBalances] = useState<Record<string, WalletBalances | null>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const sync = () =>
    run((client) => client.post(meSyncSchema, platformPaths.meSync())).then((result) => {
      if (!result) return;
      setEmail(result.email);
      if (result.wallet_address) setPayout(result.wallet_address.toLowerCase());
    });

  const { linkEmail, linkWallet } = useLinkAccount({ onSuccess: () => void sync() });

  const wallets: LinkedWallet[] = (user?.linkedAccounts ?? [])
    .filter((a) => a.type === "wallet")
    .map((a) => a as unknown as LinkedWallet);
  const walletKey = wallets.map((w) => w.address.toLowerCase()).join(",");

  useEffect(() => {
    let active = true;
    for (const address of walletKey ? walletKey.split(",") : []) {
      readWalletBalances(appChain.rpcUrls.default.http[0], appUsdc, address)
        .then((b) => active && setBalances((prev) => ({ ...prev, [address]: b })))
        .catch(() => active && setBalances((prev) => ({ ...prev, [address]: null })));
    }
    return () => {
      active = false;
    };
  }, [walletKey]);

  const choosePayout = async (address: string) => {
    setSaved(null);
    const result = await run((client) =>
      client.request(payoutWalletSchema, platformPaths.mePayoutWallet(), { method: "PUT", body: { address } }),
    );
    if (result) {
      setPayout(result.wallet_address.toLowerCase());
      setSaved(address.toLowerCase());
    }
  };

  const isContributor = session.role === "contributor";

  return (
    <>
      <WorkspaceHeader
        eyebrow={eyebrow}
        title="Account"
        description="Your sign-in email and wallets. Zeno created a wallet for you when you signed up; link another one any time."
      />
      <div className="space-y-5">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="font-display text-title text-ink">Email</h2>
          {email ? (
            <p className="mt-2 text-body-sm text-ink-2">
              {email} <span className="text-ink-4">· used for receipts and alerts</span>
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-body-sm text-ink-3">
                No email yet. Add one for card receipts and account alerts.
              </p>
              <Button size="sm" onClick={() => linkEmail()} disabled={pending}>
                Add an email
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-title text-ink">Wallets</h2>
            <Button size="sm" variant="secondary" onClick={() => linkWallet()} disabled={pending}>
              Link a wallet
            </Button>
          </div>
          <p className="mt-1 text-body-sm text-ink-3">
            {isContributor
              ? "Payouts for accepted labels go to the wallet marked as your payout wallet. Link Cake Wallet, MetaMask or any WalletConnect wallet to be paid there."
              : "Fund jobs from any of these wallets, or pay by card. Balances are on " + appChain.name + "."}
          </p>

          {wallets.length === 0 ? (
            <p className="mt-4 text-body-sm text-ink-3">No wallet is linked yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {wallets.map((w) => {
                const address = w.address.toLowerCase();
                const b = balances[address];
                const embedded = w.walletClientType === "privy";
                return (
                  <li key={address} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink">
                        <span className="font-medium">{embedded ? "Zeno wallet" : walletName(w.walletClientType)}</span>
                        {payout === address ? <Badge tone="accent">{isContributor ? "Payout wallet" : "Account wallet"}</Badge> : null}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] text-ink-3">
                        {w.address}{" "}
                        <button
                          type="button"
                          className="font-sans text-caption underline hover:text-ink"
                          onClick={() => void navigator.clipboard.writeText(w.address)}
                        >
                          copy
                        </button>
                      </p>
                      <p className="mt-0.5 text-caption text-ink-4">
                        {b === undefined
                          ? "Checking balance…"
                          : b === null
                            ? "Balance unavailable"
                            : `${formatUsdc(units6(b.tokenUnits))} · ${eth(b.gasWei)} ETH`}
                      </p>
                    </div>
                    {payout !== address ? (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => void choosePayout(w.address)}>
                        {isContributor ? "Receive payouts here" : "Use as account wallet"}
                      </Button>
                    ) : saved === address ? (
                      <span className="text-caption text-success-fg">Saved</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <InlineError error={error} />
        </section>

        <InfoNote>
          Test mode: balances are test USDC and ETH on {appChain.name}. Zeno never holds your keys; the Zeno
          wallet is a Privy embedded wallet that only you control.
        </InfoNote>
      </div>
    </>
  );
}
