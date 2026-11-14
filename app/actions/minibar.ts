"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { ActionResult } from "@/lib/pos-types";

function refresh() {
  revalidatePath("/admin/minibar");
  revalidatePath("/pos");
}

export async function saveRoomMinibar(input: {
  roomId: string;
  productId: string;
  defaultQuantity: number;
}): Promise<ActionResult> {
  const quantity = Number(input.defaultQuantity);
  if (!input.roomId) return { ok: false, error: "Chọn phòng." };
  if (!input.productId) return { ok: false, error: "Chọn món minibar." };
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "Số lượng mặc định phải là số nguyên lớn hơn 0." };
  }

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, is_minibar_item")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError) return { ok: false, error: productError.message };
  if (!product) return { ok: false, error: "Không tìm thấy món." };
  if (!product.is_minibar_item) {
    return { ok: false, error: "Chỉ gán được món đã bật Minibar trong Menu." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("room_minibar_setup")
    .select("id")
    .eq("room_id", input.roomId)
    .eq("product_id", input.productId)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };

  if (existing) {
    const { error } = await supabase
      .from("room_minibar_setup")
      .update({ default_quantity: quantity })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("room_minibar_setup").insert({
      room_id: input.roomId,
      product_id: input.productId,
      default_quantity: quantity,
    });
    if (error) return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function removeRoomMinibar(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Không tìm thấy dòng minibar." };
  const supabase = await createClient();
  const { error } = await supabase.from("room_minibar_setup").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}
