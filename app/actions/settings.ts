"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import type { ActionResult } from "@/lib/pos-types";
import { createDb } from "@/utils/supabase/db";

export type ShopSettings = {
  id: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  receiptFooter: string;
  bankBin: string;
  bankAccountNumber: string;
  bankAccountName: string;
  printerPaperMm: 58 | 80;
  printerAutoPrint: boolean;
  printerCopies: number;
  printerName: string;
};

const SETTINGS_SELECT =
  "id, shop_name, shop_address, shop_phone, receipt_footer, bank_bin, bank_account_number, bank_account_name, printer_paper_mm, printer_auto_print, printer_copies, printer_name";

function mapSettings(data: Record<string, unknown>): ShopSettings {
  const paper = Number(data.printer_paper_mm) === 58 ? 58 : 80;
  return {
    id: String(data.id),
    shopName: String(data.shop_name ?? "Karaoke"),
    shopAddress: String(data.shop_address ?? ""),
    shopPhone: String(data.shop_phone ?? ""),
    receiptFooter: String(data.receipt_footer ?? "Cảm ơn quý khách"),
    bankBin: String(data.bank_bin ?? ""),
    bankAccountNumber: String(data.bank_account_number ?? ""),
    bankAccountName: String(data.bank_account_name ?? ""),
    printerPaperMm: paper,
    printerAutoPrint: Boolean(data.printer_auto_print),
    printerCopies: Math.min(3, Math.max(1, Number(data.printer_copies) || 1)),
    printerName: String(data.printer_name ?? ""),
  };
}

async function readSettingsRow() {
  const supabase = createDb();
  const full = await supabase
    .from("shop_settings")
    .select(SETTINGS_SELECT)
    .order("id")
    .limit(1)
    .maybeSingle();

  if (!full.error && full.data) {
    return { data: mapSettings(full.data as Record<string, unknown>), error: null as string | null };
  }

  // Fallback before migration: bank columns only.
  const basic = await supabase
    .from("shop_settings")
    .select("id, bank_bin, bank_account_number, bank_account_name")
    .order("id")
    .limit(1)
    .maybeSingle();

  if (basic.error) return { data: null, error: basic.error.message };
  if (!basic.data) {
    return {
      data: null,
      error: "Chưa có cấu hình cửa hàng. Chạy update_shop_settings_full.sql trong Supabase.",
    };
  }

  return {
    data: mapSettings({
      ...basic.data,
      shop_name: "Karaoke",
      shop_address: "",
      shop_phone: "",
      receipt_footer: "Cảm ơn quý khách",
      printer_paper_mm: 80,
      printer_auto_print: false,
      printer_copies: 1,
      printer_name: "",
    }),
    error: null,
  };
}

export async function getShopSettings(): Promise<
  { ok: true; settings: ShopSettings } | { ok: false; error: string }
> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  const result = await readSettingsRow();
  if (result.error || !result.data) {
    return { ok: false, error: result.error ?? "Không đọc được cài đặt." };
  }
  return { ok: true, settings: result.data };
}

export async function saveShopProfile(input: {
  id: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  receiptFooter: string;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  const shopName = input.shopName.trim() || "Karaoke";
  const shopAddress = input.shopAddress.trim();
  const shopPhone = input.shopPhone.trim();
  const receiptFooter = input.receiptFooter.trim() || "Cảm ơn quý khách";
  if (!input.id) return { ok: false, error: "Thiếu cấu hình cửa hàng." };

  const supabase = createDb();
  const { data, error } = await supabase
    .from("shop_settings")
    .update({
      shop_name: shopName,
      shop_address: shopAddress,
      shop_phone: shopPhone,
      receipt_footer: receiptFooter,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("shop_name") || error.message.includes("column")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột cửa hàng. Chạy update_shop_settings_full.sql trong Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Không tìm thấy cấu hình cửa hàng." };

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function saveShopBank(input: {
  id: string;
  bankBin: string;
  bankAccountNumber: string;
  bankAccountName: string;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  const bankBin = input.bankBin.trim();
  const bankAccountNumber = input.bankAccountNumber.trim();
  const bankAccountName = input.bankAccountName.trim().toUpperCase();

  if (!input.id) return { ok: false, error: "Thiếu cấu hình cửa hàng." };
  if (!/^\d{6}$/.test(bankBin)) return { ok: false, error: "Mã BIN ngân hàng phải gồm 6 số." };
  if (!bankAccountNumber) return { ok: false, error: "Nhập số tài khoản." };
  if (!bankAccountName) return { ok: false, error: "Nhập tên chủ tài khoản." };

  const supabase = createDb();
  const { data, error } = await supabase
    .from("shop_settings")
    .update({
      bank_bin: bankBin,
      bank_account_number: bankAccountNumber,
      bank_account_name: bankAccountName,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Không tìm thấy cấu hình cửa hàng." };

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function savePrinterSettings(input: {
  id: string;
  printerPaperMm: number;
  printerAutoPrint: boolean;
  printerCopies: number;
  printerName: string;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  if (!input.id) return { ok: false, error: "Thiếu cấu hình cửa hàng." };
  const paper = Number(input.printerPaperMm) === 58 ? 58 : 80;
  const copies = Math.min(3, Math.max(1, Math.floor(Number(input.printerCopies) || 1)));
  const printerName = input.printerName.trim();

  const supabase = createDb();
  const { data, error } = await supabase
    .from("shop_settings")
    .update({
      printer_paper_mm: paper,
      printer_auto_print: Boolean(input.printerAutoPrint),
      printer_copies: copies,
      printer_name: printerName,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("printer_") || error.message.includes("column")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột máy in. Chạy update_shop_settings_full.sql trong Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Không tìm thấy cấu hình cửa hàng." };

  revalidatePath("/admin/settings");
  return { ok: true };
}

/** @deprecated use saveShopBank — kept for older forms */
export async function saveShopSettings(input: {
  id: string;
  bankBin: string;
  bankAccountNumber: string;
  bankAccountName: string;
}): Promise<ActionResult> {
  return saveShopBank(input);
}
