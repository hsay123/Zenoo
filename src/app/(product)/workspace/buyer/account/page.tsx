import type { Metadata } from "next";
import { AccountSettings } from "@/components/product/AccountSettings";

export const metadata: Metadata = { title: "Account" };

export default function BuyerAccountPage() {
  return <AccountSettings eyebrow="Buyer" />;
}
