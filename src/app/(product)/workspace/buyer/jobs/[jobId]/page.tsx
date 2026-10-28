import type { Metadata } from "next";
import { BuyerJobDetail } from "@/components/product/BuyerJobDetail";

export const metadata: Metadata = { title: "Job detail" };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <BuyerJobDetail jobId={jobId} />;
}
