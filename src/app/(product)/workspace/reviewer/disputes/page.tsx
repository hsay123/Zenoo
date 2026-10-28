import type { Metadata } from "next";
import { ReviewerDisputes } from "@/components/product/ReviewerDisputes";

export const metadata: Metadata = { title: "Disputes" };

export default function ReviewerDisputesPage() {
  return <ReviewerDisputes />;
}
