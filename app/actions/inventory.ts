"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/pos-types";
import { createClient } from "@/utils/supabase/server";

function refresh() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  // Do not revalidate /pos — kiosk does not show stock counts; avoids POS lag.
}

function wholeNonNeg(value: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/** Nhập kho: tăng tồn, ghi sổ IN. Không đụng trigger trừ kho khi thanh toán. */
export async function receiveStock(input: {
  productId: string;
  quantity: number;
  note?: string;
}): Promise<ActionResult> {
  const qty = Number(input.quantity);
  if (!input.productId) return { ok: false, error: "Chọn món." };
  if (!wholeNonNeg(qty) || qty <= 0) {
    return { ok: false, error: "Số lượng nhập phải là số nguyên lớn hơn 0." };
  }

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, category, stock_quantity")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError) return { ok: false, error: productError.message };
  if (!product) return { ok: false, error: "Không tìm thấy món." };
  if (String(product.category) === "SERVICE") {
    return { ok: false, error: "Món dịch vụ không quản lý tồn kho." };
  }

  const before = Number(product.stock_quantity);
  const after = before + qty;

  const { data: updated, error: updateError } = await supabase
    .from("products")
    .update({ stock_quantity: after })
    .eq("id", input.productId)
    .eq("stock_quantity", before)
    .select("id")
    .maybeSingle();

  if (updateError) return { ok: false, error: updateError.message };
  if (!updated) {
    return { ok: false, error: "Tồn kho vừa đổi — tải lại trang rồi nhập lại." };
  }

  const { error: moveError } = await supabase.from("stock_movements").insert({
    product_id: input.productId,
    movement_type: "IN",
    quantity_before: before,
    quantity_delta: qty,
    quantity_after: after,
    note: String(input.note ?? "").trim() || `Nhập kho ${product.name}`,
  });

  if (moveError) {
    // Best-effort rollback stock if ledger insert fails.
    await supabase.from("products").update({ stock_quantity: before }).eq("id", input.productId);
    if (moveError.message.includes("stock_movements")) {
      return {
        ok: false,
        error: "Chưa tạo bảng sổ kho. Chạy file update_inventory_movements.sql trong Supabase.",
      };
    }
    return { ok: false, error: moveError.message };
  }

  refresh();
  return { ok: true };
}

/** Kiểm kê: đặt tồn = số đếm thực tế, ghi sổ STOCKTAKE (delta = counted − before). */
export async function stocktakeProduct(input: {
  productId: string;
  countedQty: number;
  note?: string;
}): Promise<ActionResult> {
  const counted = Number(input.countedQty);
  if (!input.productId) return { ok: false, error: "Chọn món." };
  if (!wholeNonNeg(counted)) {
    return { ok: false, error: "Số đếm thực tế phải là số nguyên ≥ 0." };
  }

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, category, stock_quantity")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError) return { ok: false, error: productError.message };
  if (!product) return { ok: false, error: "Không tìm thấy món." };
  if (String(product.category) === "SERVICE") {
    return { ok: false, error: "Món dịch vụ không kiểm kê tồn." };
  }

  const before = Number(product.stock_quantity);
  const delta = counted - before;
  if (delta === 0) return { ok: false, error: "Số đếm bằng tồn hiện tại — không cần ghi." };

  const { data: updated, error: updateError } = await supabase
    .from("products")
    .update({ stock_quantity: counted })
    .eq("id", input.productId)
    .eq("stock_quantity", before)
    .select("id")
    .maybeSingle();

  if (updateError) return { ok: false, error: updateError.message };
  if (!updated) {
    return { ok: false, error: "Tồn kho vừa đổi — tải lại trang rồi kiểm kê lại." };
  }

  const { error: moveError } = await supabase.from("stock_movements").insert({
    product_id: input.productId,
    movement_type: "STOCKTAKE",
    quantity_before: before,
    quantity_delta: delta,
    quantity_after: counted,
    note:
      String(input.note ?? "").trim() ||
      `Kiểm kê ${product.name}: sổ ${before} → đếm ${counted} (Δ ${delta > 0 ? "+" : ""}${delta})`,
  });

  if (moveError) {
    await supabase.from("products").update({ stock_quantity: before }).eq("id", input.productId);
    if (moveError.message.includes("stock_movements")) {
      return {
        ok: false,
        error: "Chưa tạo bảng sổ kho. Chạy file update_inventory_movements.sql trong Supabase.",
      };
    }
    return { ok: false, error: moveError.message };
  }

  refresh();
  return { ok: true };
}
