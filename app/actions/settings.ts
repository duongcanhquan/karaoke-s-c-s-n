"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { ActionResult } from "@/lib/pos-types";

export type ShopSettings = {
  id: string;
  bankBin: string;
  bankAccountNumber: string;
  bankAccountName: string;
};

export async function getShopSettings(): Promise<
  { ok: true; settings: ShopSettings } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_settings")
    .select("id, bank_bin, bank_account_number, bank_account_name")
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Chưa có cấu hình cửa hàng. Chạy update_settings_schema.sql." };

  return {
    ok: true,
    settings: {
      id: String(data.id),
      bankBin: String(data.bank_bin ?? ""),
      bankAccountNumber: String(data.bank_account_number ?? ""),
      bankAccountName: String(data.bank_account_name ?? ""),
    },
  };
}

export async function saveShopSettings(input: {
  id: string;
  bankBin: string;
  bankAccountNumber: string;
  bankAccountName: string;
}): Promise<ActionResult> {
  const bankBin = input.bankBin.trim();
  const bankAccountNumber = input.bankAccountNumber.trim();
  const bankAccountName = input.bankAccountName.trim();

  if (!input.id) return { ok: false, error: "Thiếu cấu hình cửa hàng." };
  if (!/^\d{6}$/.test(bankBin)) return { ok: false, error: "Mã BIN ngân hàng phải gồm 6 số." };
  if (!bankAccountNumber) return { ok: false, error: "Nhập số tài khoản." };
  if (!bankAccountName) return { ok: false, error: "Nhập tên chủ tài khoản." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_settings")
    .update({
      bank_bin: bankBin,
      bank_account_number: bankAccountNumber,
      bank_account_name: bankAccountName,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/pos");
  return { ok: true };
}
