import type { Metadata } from "next";
import { BuyerApi } from "@/components/product/BuyerApi";

export const metadata: Metadata = { title: "Data API" };

export default function BuyerApiPage() {
  return <BuyerApi />;
}
