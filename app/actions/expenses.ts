"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { roundMoney } from "@/lib/money";
import { explainDbError } from "@/lib/supabase-errors";
import type { ActionResult } from "@/lib/pos-types";
import { createDb } from "@/utils/supabase/db";

function isValidYmd(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export async function logExpense(input: {
  title: string;
  category: string;
  amount: number;
  date: string;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  const title = input.title.trim();
  const category = input.category.trim();
  const amount = roundMoney(Number(input.amount));
  const date = input.date.trim();

  if (!title) return { ok: false, error: "Nhập tiêu đề chi phí." };
  if (!category) return { ok: false, error: "Nhập nhóm chi phí." };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Số tiền phải lớn hơn 0." };
  }
  if (!isValidYmd(date)) {
    return { ok: false, error: "Ngày không hợp lệ." };
  }

  const supabase = createDb();
  const { error } = await supabase.from("expenses").insert({
    title,
    category,
    amount,
    date,
  });

  if (error) {
    return { ok: false, error: explainDbError(error.message, "Không lưu được chi phí.") };
  }

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/summary");
  return { ok: true };
}
