import type { Metadata } from "next";
import { ContributorTasks } from "@/components/product/ContributorTasks";

export const metadata: Metadata = { title: "Contributor tasks" };

export default function ContributorTasksPage() {
  return <ContributorTasks />;
}
