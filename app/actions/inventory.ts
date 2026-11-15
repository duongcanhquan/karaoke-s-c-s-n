"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { bustInventoryCache } from "@/lib/cache-tags";
import { isStockKind, type StockKind } from "@/lib/inventory-meta";
import type { ActionResult } from "@/lib/pos-types";
import { createDb } from "@/utils/supabase/db";

function refresh() {
  bustInventoryCache();
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
}

function wholeNonNeg(value: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function wholePositive(value: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

/** Nhập kho theo kiện (thùng/hộp…) hoặc theo đơn vị gốc (chai/cái…). */
export async function receiveStock(input: {
  productId: string;
  /** Số kiện nhập (thùng/hộp…). 0 nếu chỉ nhập theo đơn vị gốc. */
  packQty: number;
  /** Số đơn vị lẻ thêm (chai/cái…). */
  looseQty: number;
  note?: string;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  const packQty = Number(input.packQty) || 0;
  const looseQty = Number(input.looseQty) || 0;
  if (!input.productId) return { ok: false, error: "Chọn món." };
  if (!wholeNonNeg(packQty) || !wholeNonNeg(looseQty)) {
    return { ok: false, error: "Số lượng phải là số nguyên ≥ 0." };
  }
  if (packQty <= 0 && looseQty <= 0) {
    return { ok: false, error: "Nhập ít nhất 1 kiện hoặc 1 đơn vị lẻ." };
  }

  const supabase = createDb();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select(
      "id, name, category, stock_quantity, unit, pack_unit, units_per_pack, stock_kind",
    )
    .eq("id", input.productId)
    .maybeSingle();

  if (productError) {
    if (productError.message.includes("unit") || productError.message.includes("stock_kind")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột đơn vị kho. Chạy update_inventory_units.sql trong Supabase.",
      };
    }
    return { ok: false, error: productError.message };
  }
  if (!product) return { ok: false, error: "Không tìm thấy món." };
  if (String(product.category) === "SERVICE") {
    return { ok: false, error: "Món dịch vụ không quản lý tồn kho." };
  }

  const unit = String(product.unit ?? "cái");
  const packUnit = String(product.pack_unit ?? "thùng");
  const perPack = Math.max(1, Number(product.units_per_pack) || 1);
  const qty = packQty * perPack + looseQty;

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

  const parts: string[] = [];
  if (packQty > 0) parts.push(`${packQty} ${packUnit} × ${perPack} ${unit}`);
  if (looseQty > 0) parts.push(`${looseQty} ${unit} lẻ`);
  const detail = `${parts.join(" + ")} = ${qty} ${unit}`;
  const note =
    String(input.note ?? "").trim() || `Nhập ${product.name}: ${detail}`;

  const { error: moveError } = await supabase.from("stock_movements").insert({
    product_id: input.productId,
    movement_type: "IN",
    quantity_before: before,
    quantity_delta: qty,
    quantity_after: after,
    note,
  });

  if (moveError) {
    await supabase.from("products").update({ stock_quantity: before }).eq("id", input.productId);
    if (moveError.message.includes("stock_movements")) {
      return {
        ok: false,
        error: "Chưa tạo bảng sổ kho. Chạy update_inventory_movements.sql trong Supabase.",
      };
    }
    return { ok: false, error: moveError.message };
  }

  refresh();
  return { ok: true };
}

export async function stocktakeProduct(input: {
  productId: string;
  countedQty: number;
  note?: string;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  const counted = Number(input.countedQty);
  if (!input.productId) return { ok: false, error: "Chọn món." };
  if (!wholeNonNeg(counted)) {
    return { ok: false, error: "Số đếm thực tế phải là số nguyên ≥ 0." };
  }

  const supabase = createDb();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, category, stock_quantity, unit")
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
  const unit = String(product.unit ?? "cái");

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
      `Kiểm kê ${product.name}: sổ ${before} ${unit} → đếm ${counted} ${unit} (Δ ${delta > 0 ? "+" : ""}${delta})`,
  });

  if (moveError) {
    await supabase.from("products").update({ stock_quantity: before }).eq("id", input.productId);
    if (moveError.message.includes("stock_movements")) {
      return {
        ok: false,
        error: "Chưa tạo bảng sổ kho. Chạy update_inventory_movements.sql trong Supabase.",
      };
    }
    return { ok: false, error: moveError.message };
  }

  refresh();
  return { ok: true };
}

/** Cập nhật đơn vị / quy cách đóng gói / loại tồn của món. */
export async function updateProductStockMeta(input: {
  productId: string;
  unit: string;
  packUnit: string;
  unitsPerPack: number;
  stockKind: string;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!input.productId) return { ok: false, error: "Chọn món." };

  const unit = input.unit.trim();
  const packUnit = input.packUnit.trim();
  const unitsPerPack = Number(input.unitsPerPack);
  if (!unit) return { ok: false, error: "Chọn đơn vị gốc (cái/chai…)." };
  if (!packUnit) return { ok: false, error: "Chọn đơn vị kiện (thùng/hộp…)." };
  if (!wholePositive(unitsPerPack)) {
    return { ok: false, error: "1 kiện phải ≥ 1 đơn vị gốc." };
  }
  if (!isStockKind(input.stockKind)) {
    return { ok: false, error: "Chọn loại: tiêu hao hoặc sử dụng lại." };
  }
  const stockKind: StockKind = input.stockKind;

  const supabase = createDb();
  const { data, error } = await supabase
    .from("products")
    .update({
      unit,
      pack_unit: packUnit,
      units_per_pack: unitsPerPack,
      stock_kind: stockKind,
    })
    .eq("id", input.productId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("unit") || error.message.includes("stock_kind")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột đơn vị kho. Chạy update_inventory_units.sql trong Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Không tìm thấy món." };

  refresh();
  return { ok: true };
}

export async function createInventoryUnit(name: string): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  const unit = name.trim().toLowerCase();
  if (!unit) return { ok: false, error: "Nhập tên đơn vị." };
  if (unit.length > 24) return { ok: false, error: "Tên đơn vị tối đa 24 ký tự." };

  const supabase = createDb();
  const { error } = await supabase.from("inventory_units").insert({
    name: unit,
    sort_order: 500,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Đơn vị đã có." };
    if (error.message.includes("inventory_units")) {
      return {
        ok: false,
        error: "Chưa có bảng đơn vị. Chạy update_inventory_units.sql trong Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function deleteInventoryUnit(id: string): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "Không tìm thấy đơn vị." };

  const supabase = createDb();
  const { error } = await supabase.from("inventory_units").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}
