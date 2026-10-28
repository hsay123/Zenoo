import type { Metadata } from "next";
import { BuyerQuality } from "@/components/product/BuyerQuality";

export const metadata: Metadata = { title: "Quality" };

export default function BuyerQualityPage() {
  return <BuyerQuality />;
}
