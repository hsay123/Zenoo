import type { Metadata } from "next";
import { BuyerJobExport } from "@/components/product/BuyerJobExport";

export const metadata: Metadata = { title: "Export" };

export default async function JobExportPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <BuyerJobExport jobId={jobId} />;
}
