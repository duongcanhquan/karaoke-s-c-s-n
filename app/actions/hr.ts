"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { roundMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/pos-types";
import { isStaffRole } from "@/lib/session";

function refresh() {
  revalidatePath("/admin/hr");
}

export async function createStaff(input: {
  name: string;
  role: string;
  pinCode: string;
}): Promise<ActionResult> {
  const name = input.name.trim();
  const role = input.role.trim();
  const pinCode = input.pinCode.trim();

  if (!name) return { ok: false, error: "Nhập tên nhân viên." };
  if (!isStaffRole(role)) {
    return { ok: false, error: "Chọn vai trò Quản lý, Thu ngân hoặc Nhân viên phục vụ." };
  }
  if (!pinCode) return { ok: false, error: "Nhập mã PIN." };

  const supabase = await createClient();
  const { error } = await supabase.from("users").insert({
    name,
    role,
    pin_code: pinCode,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Mã PIN đã được dùng." };
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function clockIn(input: {
  userId: string;
  hourlySalary: number;
}): Promise<ActionResult> {
  const hourlySalary = roundMoney(Number(input.hourlySalary));
  if (!input.userId) return { ok: false, error: "Chọn nhân viên." };
  if (!Number.isFinite(hourlySalary) || hourlySalary < 0) {
    return { ok: false, error: "Lương giờ phải là số không âm." };
  }

  const supabase = await createClient();
  const { data: openShift, error: openError } = await supabase
    .from("shifts")
    .select("id")
    .eq("user_id", input.userId)
    .is("end_time", null)
    .limit(1)
    .maybeSingle();

  if (openError) return { ok: false, error: openError.message };
  if (openShift) return { ok: false, error: "Nhân viên này đang trong ca." };

  const { error } = await supabase.from("shifts").insert({
    user_id: input.userId,
    hourly_salary: hourlySalary,
    total_salary: null,
  });

  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function clockOut(shiftId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: shift, error: shiftError } = await supabase
    .from("shifts")
    .select("id, start_time, hourly_salary, end_time")
    .eq("id", shiftId)
    .maybeSingle();

  if (shiftError) return { ok: false, error: shiftError.message };
  if (!shift) return { ok: false, error: "Không tìm thấy ca." };
  if (shift.end_time) return { ok: false, error: "Ca này đã kết thúc." };

  const end = new Date();
  const elapsedMs = Math.max(0, end.getTime() - new Date(shift.start_time).getTime());
  const hours = elapsedMs / 3_600_000;
  const totalSalary = roundMoney(hours * Number(shift.hourly_salary));

  const { data: closed, error } = await supabase
    .from("shifts")
    .update({
      end_time: end.toISOString(),
      total_salary: totalSalary,
    })
    .eq("id", shiftId)
    .is("end_time", null)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!closed) return { ok: false, error: "Ca này đã được chốt." };

  refresh();
  return { ok: true };
}
