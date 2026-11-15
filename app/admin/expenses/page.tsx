import { redirect } from "next/navigation";

export default function ExpensesPage() {
  redirect("/admin/finance?tab=expenses");
}
