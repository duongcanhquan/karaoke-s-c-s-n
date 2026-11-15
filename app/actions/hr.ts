"use server";

import { revalidatePath } from "next/cache";
import { checkAdminPin } from "@/lib/admin-pin";
import { requireAdminSession } from "@/lib/admin-session";
import { displayLabel } from "@/lib/display-name";
import { roundMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/pos-types";
import { isStaffRole } from "@/lib/session";
import { createDb } from "@/utils/supabase/db";

function refresh() {
  revalidatePath("/admin/hr");
  revalidatePath("/pos");
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateStaffInput(input: {
  name: string;
  displayName: string;
  role: string;
  pinCode: string;
  customerRate: number;
  staffPayoutRate: number;
  defaultHourlySalary: number;
}) {
  const name = normalizeName(input.name);
  const displayName = normalizeName(input.displayName) || name;
  const role = input.role.trim();
  const pinCode = input.pinCode.trim();
  const customerRate = roundMoney(Number(input.customerRate) || 0);
  const staffPayoutRate = roundMoney(Number(input.staffPayoutRate) || 0);
  const defaultHourlySalary = roundMoney(Number(input.defaultHourlySalary) || 0);

  if (!name) return { ok: false as const, error: "Nhập tên đăng nhập." };
  if (!isStaffRole(role)) {
    return { ok: false as const, error: "Chọn vai trò Quản lý, Thu ngân hoặc Nhân viên phục vụ." };
  }
  if (!pinCode) return { ok: false as const, error: "Nhập mã PIN." };
  if (!/^\d{4,8}$/.test(pinCode)) {
    return { ok: false as const, error: "Mã PIN phải gồm 4–8 chữ số." };
  }
  if (!Number.isFinite(customerRate) || customerRate < 0) {
    return { ok: false as const, error: "Giá hiển thị (khách) phải ≥ 0." };
  }
  if (!Number.isFinite(staffPayoutRate) || staffPayoutRate < 0) {
    return { ok: false as const, error: "Giá trả nhân viên phải ≥ 0." };
  }
  if (staffPayoutRate > customerRate) {
    return { ok: false as const, error: "Giá trả nhân viên không được cao hơn giá khách." };
  }
  if (!Number.isFinite(defaultHourlySalary) || defaultHourlySalary < 0) {
    return { ok: false as const, error: "Lương ca mặc định phải ≥ 0." };
  }

  return {
    ok: true as const,
    name,
    displayName,
    role,
    pinCode,
    customerRate,
    staffPayoutRate,
    defaultHourlySalary,
  };
}

export async function createStaff(input: {
  name: string;
  displayName: string;
  role: string;
  pinCode: string;
  customerRate: number;
  staffPayoutRate: number;
  defaultHourlySalary: number;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  const checked = validateStaffInput(input);
  if (!checked.ok) return checked;

  const supabase = createDb();
  const { error } = await supabase.from("users").insert({
    name: checked.name,
    display_name: checked.displayName,
    role: checked.role,
    pin_code: checked.pinCode,
    customer_rate: checked.customerRate,
    staff_payout_rate: checked.staffPayoutRate,
    default_hourly_salary: checked.defaultHourlySalary,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Mã PIN đã được dùng." };
    if (error.message.includes("display_name") || error.message.includes("customer_rate")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột nhân viên. Chạy update_display_names_rates.sql trong Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function updateStaff(input: {
  id: string;
  name: string;
  displayName: string;
  role: string;
  pinCode: string;
  customerRate: number;
  staffPayoutRate: number;
  defaultHourlySalary: number;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!input.id) return { ok: false, error: "Không tìm thấy nhân viên." };
  const checked = validateStaffInput(input);
  if (!checked.ok) return checked;

  const supabase = createDb();

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
      display_name: checked.displayName,
      role: checked.role,
      pin_code: checked.pinCode,
      customer_rate: checked.customerRate,
      staff_payout_rate: checked.staffPayoutRate,
      default_hourly_salary: checked.defaultHourlySalary,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Mã PIN đã được dùng." };
    if (error.message.includes("display_name") || error.message.includes("customer_rate")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột nhân viên. Chạy update_display_names_rates.sql trong Supabase.",
      };
    }
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
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!userId) return { ok: false, error: "Không tìm thấy nhân viên." };
  const pinOk = await checkAdminPin(managerPin);
  if (!pinOk.ok) return pinOk;

  const supabase = createDb();
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
        error:
          "Nhân viên đã có ca hoặc lịch phục vụ. Không xóa được — hãy sửa thông tin thay vì xóa.",
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
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  let hourlySalary = roundMoney(Number(input.hourlySalary));
  if (!input.userId) return { ok: false, error: "Chọn nhân viên." };

  const supabase = createDb();

  if (!Number.isFinite(hourlySalary) || hourlySalary < 0) {
    return { ok: false, error: "Lương giờ phải là số không âm." };
  }

  // If left 0, use staff default hourly salary when available.
  if (hourlySalary === 0) {
    const { data: member } = await supabase
      .from("users")
      .select("default_hourly_salary")
      .eq("id", input.userId)
      .maybeSingle();
    const def = roundMoney(Number(member?.default_hourly_salary) || 0);
    if (def > 0) hourlySalary = def;
  }

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

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Nhân viên này đang trong ca." };
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function clockOut(shiftId: string): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  const supabase = createDb();
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

export { displayLabel };
