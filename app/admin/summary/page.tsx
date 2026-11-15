import { redirect } from "next/navigation";

export default function ManagerSummaryRedirect() {
  redirect("/admin/finance?tab=summary");
}
