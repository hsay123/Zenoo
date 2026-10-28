import type { Metadata } from "next";
import Link from "next/link";
import { ReviewConsole } from "@/components/product/ReviewConsole";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-5 text-caption text-ink-4">
        <Link href="/workspace/reviewer" className="hover:text-ink">
          Queue
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="font-mono">{taskId}</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Reviewer · decision"
        title="Evaluate submission"
        description="Compare the submitted annotation with the media, then record a decision. Validation runs at submit time; your decision is tied to this submission version."
      />

      <ReviewConsole taskId={taskId} />
    </>
  );
}
