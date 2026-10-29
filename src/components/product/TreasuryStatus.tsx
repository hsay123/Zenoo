"use client";

import { useClientQuery } from "@/lib/api/live";
import { platformPaths, treasuryStatusSchema } from "@/lib/api/platform";
import { QueryView } from "@/components/product/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { appChain } from "@/lib/privy/config";
import { formatUsdc } from "@/lib/utils/format";

/**
 * Admin: the treasury float that card funding and the testnet faucet draw on,
 * with a warning before it runs low (top it up from the owner wallet).
 */
export function TreasuryStatus() {
  const status = useClientQuery("admin-treasury", (client) => client.get(treasuryStatusSchema, platformPaths.adminTreasury()));
  return (
    <section className="mt-8 rounded-xl border border-line bg-surface p-6">
      <QueryView query={status} loadingLabel="Loading treasury">
        {(t) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-title text-ink">Treasury</h2>
              {t.warnings.length ? <Badge tone="dark">Needs a top-up</Badge> : <Badge tone="accent">Healthy</Badge>}
            </div>
            {t.configured ? (
              <p className="mt-2 text-body-sm text-ink-2">
                {t.usdc !== null ? formatUsdc(t.usdc) : "—"} ·{" "}
                {t.gas_wei !== null ? (Number(BigInt(t.gas_wei) / BigInt(1_000_000_000_000)) / 1_000_000).toFixed(6) : "—"} ETH on{" "}
                {appChain.name} ·{" "}
                <a
                  className="font-mono text-[12px] underline"
                  href={`${appChain.blockExplorers.default.url}/address/${t.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.address?.slice(0, 6)}…{t.address?.slice(-4)}
                </a>
              </p>
            ) : (
              <p className="mt-2 text-body-sm text-ink-3">Not configured: {t.reason}</p>
            )}
            {t.warnings.map((w) => (
              <p key={w} className="mt-2 text-body-sm text-danger-fg">
                {w}
              </p>
            ))}
            <p className="mt-2 text-caption text-ink-4">
              Card payments become escrow funding from this float; the testnet faucet also draws on it.
            </p>
          </>
        )}
      </QueryView>
    </section>
  );
}
