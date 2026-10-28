import type { Metadata } from "next";
import { BuyerDashboard } from "@/components/product/BuyerDashboard";

export const metadata: Metadata = {
  title: "Buyer dashboard",
};

export default function BuyerDashboardPage() {
  return <BuyerDashboard />;
}
