"use client";

import { useReceipt } from "@/lib/api/live";
import { QueryView } from "@/components/product/AsyncView";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Receipt as ReceiptIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Public payout receipt.
 *
 * Reads `GET /api/receipts/{id}`, which the API serves without authentication
 * and with no contributor identity. A mocked payout is labelled as such — the
 * reference is a deterministic mock hash, never described as an on-chain
 * transaction unless settlement actually ran against the contract.
 */
export function PublicReceipt({ receiptId }: { receiptId: string }) {
  const receipt = useReceipt(receiptId);

  return (
    <Section tone="canvas" spacing="default" contained={false}>
      <Container size="prose">
        <p className="font-mono text-caption uppercase tracking-[0.14em] text-ink-4">
          Zeno
        </p>
        <h1 className="mt-2 font-display text-display text-ink">Payout receipt</h1>
        <p className="mt-3 text-body text-ink-3">
          A minimal, public record of one accepted annotation version and its
          settlement. It carries content hashes and the settlement reference and
          no contributor identity.
        </p>

        <div className="mt-8">
          <QueryView query={receipt}>
            {(receipt) => (
              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-muted text-ink-3">
                    <ReceiptIcon aria-hidden className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-title text-ink">
                      {receipt.is_mock ? "Mock settlement" : "On-chain settlement"}
                    </p>
                    <p className="text-caption text-ink-3">
                      Recorded {formatDateTime(receipt.created_at)}
                    </p>
                  </div>
                </div>

                {receipt.is_mock ? (
                  <p
                    role="note"
                    className="mt-4 rounded-lg border border-line bg-surface-muted p-4 text-caption text-ink-3"
                  >
                    This payout was recorded by the platform&rsquo;s mock settlement
                    service. The reference below is a deterministic mock hash, not a
                    transaction on any public chain.
                  </p>
                ) : null}

                <dl className="mt-6 space-y-4">
                  <Row label="Receipt id" value={receipt.id} mono />
                  <Row label="Task id" value={receipt.task_id} mono />
                  <Row label="Annotation hash" value={receipt.annotation_hash} mono />
                  <Row label="Policy hash" value={receipt.policy_hash} mono />
                  <Row label="Review path" value={receipt.reviewer_type ?? "—"} />
                  <Row
                    label="Settlement reference"
                    value={receipt.tx_hash ?? "Not recorded"}
                    mono
                  />
                </dl>
              </div>
            )}
          </QueryView>
        </div>
      </Container>
    </Section>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-caption uppercase tracking-[0.05em] text-ink-4">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "break-all font-mono text-[12px] text-ink"
            : "text-body-sm text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
