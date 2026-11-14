"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { roundMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/pos-types";

export async function logExpense(input: {
  title: string;
  category: string;
  amount: number;
  date: string;
}): Promise<ActionResult> {
  const title = input.title.trim();
  const category = input.category.trim();
  const amount = roundMoney(Number(input.amount));
  const date = input.date.trim();

  if (!title) return { ok: false, error: "Nhập tiêu đề chi phí." };
  if (!category) return { ok: false, error: "Nhập nhóm chi phí." };
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Số tiền phải là số không âm." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return { ok: false, error: "Ngày không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    title,
    category,
    amount,
    date,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin");
  return { ok: true };
}
