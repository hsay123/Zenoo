import type { Metadata } from "next";
import { ContributorSubmissions } from "@/components/product/ContributorSubmissions";

export const metadata: Metadata = { title: "Submissions" };

export default function ContributorSubmissionsPage() {
  return <ContributorSubmissions />;
}
