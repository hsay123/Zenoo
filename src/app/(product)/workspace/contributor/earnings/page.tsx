import type { Metadata } from "next";
import { ContributorEarnings } from "@/components/product/ContributorEarnings";

export const metadata: Metadata = { title: "Earnings" };

export default function ContributorEarningsPage() {
  return <ContributorEarnings />;
}
