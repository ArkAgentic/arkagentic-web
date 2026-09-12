import { redirect } from "next/navigation";

export default function AdminUsageRedirectPage() {
  redirect("/console/admin/usage");
}
