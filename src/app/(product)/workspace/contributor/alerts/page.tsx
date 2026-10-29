import type { Metadata } from "next";
import { AlertsSettings } from "@/components/product/AlertsSettings";

export const metadata: Metadata = { title: "Alerts" };

export default function ContributorAlertsPage() {
  return <AlertsSettings eyebrow="Contributor" />;
}
