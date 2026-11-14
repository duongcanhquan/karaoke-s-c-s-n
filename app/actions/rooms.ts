"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { roundMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/pos-types";

function refresh() {
  revalidatePath("/admin/rooms");
  revalidatePath("/pos");
  revalidatePath("/admin/minibar");
}

export async function createRoom(input: {
  name: string;
  type: string;
  hourlyRate: number;
}): Promise<ActionResult> {
  const name = input.name.trim();
  const type = input.type.trim();
  const hourlyRate = roundMoney(Number(input.hourlyRate));
  if (!name) return { ok: false, error: "Nhập tên phòng." };
  if (!type) return { ok: false, error: "Nhập loại phòng." };
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    return { ok: false, error: "Giá giờ phải là số không âm." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("rooms").insert({
    name,
    type,
    hourly_rate: hourlyRate,
    status: "AVAILABLE",
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Tên phòng đã có." };
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function deleteRoom(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Không tìm thấy phòng." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", id)
    .eq("status", "AVAILABLE")
    .select("id");
  if (error) {
    if (error.code === "23503") return { ok: false, error: "Phòng đã có hóa đơn, không xóa được." };
    return { ok: false, error: error.message };
  }
  if (!data?.length) return { ok: false, error: "Chỉ xóa được phòng đang trống." };
  refresh();
  return { ok: true };
}
