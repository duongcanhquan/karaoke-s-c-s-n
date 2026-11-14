"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { isProductCategory, type ProductCategory } from "@/lib/catalog";
import { roundMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/pos-types";

export type ProductInput = {
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  isMinibarItem: boolean;
};

function refresh() {
  revalidatePath("/admin/products");
  revalidatePath("/admin/minibar");
  revalidatePath("/inventory");
  revalidatePath("/pos");
}

function parseProduct(input: ProductInput):
  | { error: string }
  | {
      row: {
        name: string;
        category: ProductCategory;
        cost_price: number;
        selling_price: number;
        stock_quantity: number;
        is_minibar_item: boolean;
      };
    } {
  const name = input.name.trim();
  const category = input.category.trim();
  const costPrice = roundMoney(Number(input.costPrice));
  const sellingPrice = roundMoney(Number(input.sellingPrice));
  const stockQuantity = Number(input.stockQuantity);

  if (!name) return { error: "Nhập tên món." };
  if (!isProductCategory(category)) return { error: "Chọn nhóm FOOD, DRINK hoặc SERVICE." };
  if (!Number.isFinite(costPrice) || costPrice < 0) return { error: "Giá vốn phải là số không âm." };
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    return { error: "Giá bán phải là số không âm." };
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return { error: "Tồn kho phải là số nguyên không âm." };
  }

  return {
    row: {
      name,
      category,
      cost_price: costPrice,
      selling_price: sellingPrice,
      stock_quantity: stockQuantity,
      is_minibar_item: Boolean(input.isMinibarItem),
    },
  };
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const parsed = parseProduct(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert(parsed.row);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Không tìm thấy món." };
  const parsed = parseProduct(input);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(parsed.row)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Không tìm thấy món." };

  refresh();
  return { ok: true };
}

export async function setMinibarItem(id: string, isMinibarItem: boolean): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Không tìm thấy món." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_minibar_item: isMinibarItem })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Không tìm thấy món." };

  refresh();
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Không tìm thấy món." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return { ok: false, error: "Món đang có trên hóa đơn hoặc minibar phòng. Gỡ khỏi đó trước." };
    }
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}
