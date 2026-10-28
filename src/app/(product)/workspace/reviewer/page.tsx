import type { Metadata } from "next";
import { ReviewerQueue } from "@/components/product/ReviewerQueue";

export const metadata: Metadata = { title: "Review queue" };

export default function ReviewerQueuePage() {
  return <ReviewerQueue />;
}
