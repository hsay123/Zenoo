import type { Metadata } from "next";
import { AdminUsers } from "@/components/product/AdminUsers";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage() {
  return <AdminUsers />;
}
