import { redirect } from "next/navigation";

export default function AdminMinibarPage() {
  redirect("/admin/setup?tab=minibar");
}
