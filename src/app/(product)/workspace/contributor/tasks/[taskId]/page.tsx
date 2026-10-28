import type { Metadata } from "next";
import Link from "next/link";
import { AnnotationWorkspace } from "@/components/product/AnnotationWorkspace";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";

export const metadata: Metadata = { title: "Annotation workspace" };

export default async function TaskWorkspacePage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-5 text-caption text-ink-4">
        <Link href="/workspace/contributor" className="hover:text-ink">
          Tasks
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="font-mono">{taskId}</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Contributor · workspace"
        title="Annotation workspace"
        description="Annotate against the schema for this task's modality. Open work is saved as a draft; submitting creates an immutable version."
      />

      <AnnotationWorkspace taskId={taskId} />
    </>
  );
}
