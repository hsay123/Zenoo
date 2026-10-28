import type { Metadata } from "next";
import { NewJobWizard } from "@/components/product/NewJobWizard";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";

export const metadata: Metadata = {
  title: "New job",
};

export default function NewJobPage() {
  return (
    <>
      <WorkspaceHeader
        eyebrow="Buyer"
        title="New job"
        description="Define the project, declare the data rights, choose the schema and set the budget. Nothing becomes payable until the job is funded."
      />
      <NewJobWizard />
    </>
  );
}
