"use server";

import { revalidatePath } from "next/cache";
import { createDb } from "@/utils/supabase/db";
import { checkAdminPin } from "@/lib/admin-pin";
import { requireAdminSession } from "@/lib/admin-session";
import { bustProductsCache } from "@/lib/cache-tags";
import { isProductCategory, type ProductCategory } from "@/lib/catalog";
import { roundMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/pos-types";

export type ProductInput = {
  name: string;
  displayName: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  isMinibarItem: boolean;
};

function refresh() {
  bustProductsCache();
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/products");
  revalidatePath("/admin/minibar");
  revalidatePath("/admin/setup");
  revalidatePath("/admin/inventory");
  revalidatePath("/pos");
}

function parseProduct(input: ProductInput):
  | { error: string }
  | {
      row: {
        name: string;
        display_name: string;
        category: ProductCategory;
        cost_price: number;
        selling_price: number;
        stock_quantity: number;
        is_minibar_item: boolean;
      };
    } {
  const name = input.name.trim();
  const displayName = input.displayName.trim() || name;
  const category = input.category.trim();
  const costPrice = roundMoney(Number(input.costPrice));
  const sellingPrice = roundMoney(Number(input.sellingPrice));
  const stockQuantity = Number(input.stockQuantity);

  if (!name) return { error: "Nhập tên nội bộ món." };
  if (!isProductCategory(category)) return { error: "Chọn nhóm Đồ ăn, Đồ uống hoặc Dịch vụ." };
  if (!Number.isFinite(costPrice) || costPrice < 0) return { error: "Giá vốn phải là số không âm." };
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    return { error: "Giá bán (hiển thị) phải là số không âm." };
  }
  if (category === "SERVICE") {
    return {
      row: {
        name,
        display_name: displayName,
        category,
        cost_price: costPrice,
        selling_price: sellingPrice,
        stock_quantity: 0,
        is_minibar_item: false,
      },
    };
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return { error: "Tồn kho phải là số nguyên không âm." };
  }

  return {
    row: {
      name,
      display_name: displayName,
      category,
      cost_price: costPrice,
      selling_price: sellingPrice,
      stock_quantity: stockQuantity,
      is_minibar_item: Boolean(input.isMinibarItem),
    },
  };
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  const parsed = parseProduct(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = createDb();
  const { error } = await supabase.from("products").insert(parsed.row);
  if (error) {
    if (error.message.includes("display_name")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột tên hiển thị. Chạy update_display_names_rates.sql trong Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "Không tìm thấy món." };

  const parsed = parseProduct(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = createDb();
  // Never overwrite live stock from the product form — kho owns stock.
  const { data, error } = await supabase
    .from("products")
    .update({
      name: parsed.row.name,
      display_name: parsed.row.display_name,
      category: parsed.row.category,
      cost_price: parsed.row.cost_price,
      selling_price: parsed.row.selling_price,
      is_minibar_item: parsed.row.is_minibar_item,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("display_name")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột tên hiển thị. Chạy update_display_names_rates.sql trong Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Không tìm thấy món." };

  if (!parsed.row.is_minibar_item) {
    await supabase.from("room_minibar_setup").delete().eq("product_id", id);
  }

  refresh();
  return { ok: true };
}

export async function setMinibarItem(id: string, isMinibarItem: boolean): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "Không tìm thấy món." };

  const supabase = createDb();
  const { data, error } = await supabase
    .from("products")
    .update({ is_minibar_item: isMinibarItem })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Không tìm thấy món." };

  if (!isMinibarItem) {
    await supabase.from("room_minibar_setup").delete().eq("product_id", id);
  }

  refresh();
  return { ok: true };
}

export async function deleteProduct(id: string, managerPin: string): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "Không tìm thấy món." };
  const pinOk = await checkAdminPin(managerPin);
  if (!pinOk.ok) return pinOk;

  const supabase = createDb();
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error:
          "Món đang gắn hóa đơn, minibar phòng, hoặc sổ kho. Gỡ liên kết trước (hoặc chỉ ngừng bán).",
      };
    }
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}
