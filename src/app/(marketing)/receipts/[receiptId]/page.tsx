import type { Metadata } from "next";
import { PublicReceipt } from "@/components/receipts/PublicReceipt";

export const metadata: Metadata = {
  title: "Payout receipt",
  description:
    "A public, identity-free record of an accepted annotation version and its settlement.",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  return <PublicReceipt receiptId={receiptId} />;
}
