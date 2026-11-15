"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { checkAdminPin } from "@/lib/admin-pin";
import { roundMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/pos-types";
import { isStaffRole } from "@/lib/session";

function refresh() {
  revalidatePath("/admin/hr");
  // POS no longer loads staff for bookings — skip /pos revalidate lag.
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateStaffInput(input: { name: string; role: string; pinCode: string }) {
  const name = normalizeName(input.name);
  const role = input.role.trim();
  const pinCode = input.pinCode.trim();

  if (!name) return { ok: false as const, error: "Nhập tên nhân viên." };
  if (!isStaffRole(role)) {
    return { ok: false as const, error: "Chọn vai trò Quản lý, Thu ngân hoặc Nhân viên phục vụ." };
  }
  if (!pinCode) return { ok: false as const, error: "Nhập mã PIN." };
  if (!/^\d{4,8}$/.test(pinCode)) {
    return { ok: false as const, error: "Mã PIN phải gồm 4–8 chữ số." };
  }
  return { ok: true as const, name, role, pinCode };
}

export async function createStaff(input: {
  name: string;
  role: string;
  pinCode: string;
}): Promise<ActionResult> {
  const checked = validateStaffInput(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { error } = await supabase.from("users").insert({
    name: checked.name,
    role: checked.role,
    pin_code: checked.pinCode,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Mã PIN đã được dùng." };
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function updateStaff(input: {
  id: string;
  name: string;
  role: string;
  pinCode: string;
}): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: "Không tìm thấy nhân viên." };
  const checked = validateStaffInput(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();

  if (checked.role !== "ADMIN") {
    const { data: current, error: currentError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", input.id)
      .maybeSingle();
    if (currentError) return { ok: false, error: currentError.message };
    if (!current) return { ok: false, error: "Không tìm thấy nhân viên." };

    if (String(current.role) === "ADMIN") {
      const { count, error: countError } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "ADMIN");
      if (countError) return { ok: false, error: countError.message };
      if ((count ?? 0) <= 1) {
        return { ok: false, error: "Phải giữ ít nhất một tài khoản Quản lý." };
      }
    }
  }

  const { data, error } = await supabase
    .from("users")
    .update({
      name: checked.name,
      role: checked.role,
      pin_code: checked.pinCode,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Mã PIN đã được dùng." };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Không tìm thấy nhân viên." };

  refresh();
  return { ok: true };
}

export async function deleteStaff(
  userId: string,
  managerPin: string,
): Promise<ActionResult> {
  if (!userId) return { ok: false, error: "Không tìm thấy nhân viên." };
  const pinOk = await checkAdminPin(managerPin);
  if (!pinOk.ok) return pinOk;

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Không tìm thấy nhân viên." };

  if (String(current.role) === "ADMIN") {
    const { count, error: countError } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "ADMIN");
    if (countError) return { ok: false, error: countError.message };
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "Không thể xóa quản lý cuối cùng." };
    }
  }

  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Nhân viên đã có ca hoặc lịch phục vụ. Không xóa được — hãy sửa thông tin thay vì xóa.",
      };
    }
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
