import type { Metadata } from "next";
import { BuyerExports } from "@/components/product/BuyerExports";

export const metadata: Metadata = { title: "Exports" };

export default function BuyerExportsPage() {
  return <BuyerExports />;
}
