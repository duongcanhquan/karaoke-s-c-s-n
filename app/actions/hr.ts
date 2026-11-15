"use server";

import { revalidatePath } from "next/cache";
import { checkAdminPin } from "@/lib/admin-pin";
import { requireAdminSession } from "@/lib/admin-session";
import { displayLabel } from "@/lib/display-name";
import { roundMoney } from "@/lib/money";
import {
  computeShiftTotal,
  isShiftPayMode,
  isStaffPayType,
  normalizeTimeInput,
  resolveClockRate,
} from "@/lib/shift-pay";
import { explainDbError } from "@/lib/supabase-errors";
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

function makeServicePin() {
  return `sv${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
}

function missingPaySchemaHint(message: string) {
  if (
    /pay_type|monthly_salary|require_clock_in|shift_templates|staff_shift_rates|template_id|pay_mode/i.test(
      message,
    )
  ) {
    return "Chưa chạy update_shift_templates.sql trong Supabase.";
  }
  return null;
}

function validateStaffInput(input: {
  name: string;
  displayName: string;
  role: string;
  pinCode: string;
  customerRate: number;
  staffPayoutRate: number;
  defaultHourlySalary: number;
  payType: string;
  monthlySalary: number;
  requireClockIn: boolean;
}) {
  const name = normalizeName(input.name);
  const displayName = normalizeName(input.displayName) || name;
  const role = input.role.trim();
  const pinCode = input.pinCode.trim();
  const customerRate = roundMoney(Number(input.customerRate) || 0);
  const staffPayoutRate = roundMoney(Number(input.staffPayoutRate) || 0);
  const defaultHourlySalary = roundMoney(Number(input.defaultHourlySalary) || 0);
  const payType = String(input.payType || "SHIFT").trim();
  const monthlySalary = roundMoney(Number(input.monthlySalary) || 0);
  const requireClockIn = Boolean(input.requireClockIn);

  if (!name) {
    return {
      ok: false as const,
      error: role === "SERVICE_STAFF" ? "Nhập tên nhân viên." : "Nhập tên đăng nhập.",
    };
  }
  if (!isStaffRole(role)) {
    return { ok: false as const, error: "Chọn vai trò Quản lý, Thu ngân hoặc Nhân viên phục vụ." };
  }

  const needsLogin = role === "ADMIN" || role === "CASHIER";
  if (needsLogin) {
    if (!pinCode) return { ok: false as const, error: "Nhập mã PIN." };
    if (!/^\d{4,8}$/.test(pinCode)) {
      return { ok: false as const, error: "Mã PIN phải gồm 4–8 chữ số." };
    }
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

  // Phục vụ không vào ca lương — luôn SHIFT với mức 0.
  const effectivePayType =
    role === "SERVICE_STAFF" ? "SHIFT" : isStaffPayType(payType) ? payType : "";
  if (!effectivePayType) {
    return { ok: false as const, error: "Chọn chế độ lương: theo ca hoặc lương tháng." };
  }
  if (!Number.isFinite(monthlySalary) || monthlySalary < 0) {
    return { ok: false as const, error: "Lương tháng phải ≥ 0." };
  }
  if (effectivePayType === "MONTHLY" && monthlySalary <= 0) {
    return { ok: false as const, error: "Nhập mức lương tháng." };
  }

  return {
    ok: true as const,
    name,
    displayName,
    role,
    pinCode: needsLogin ? pinCode : pinCode || makeServicePin(),
    customerRate,
    staffPayoutRate,
    defaultHourlySalary: effectivePayType === "MONTHLY" ? 0 : defaultHourlySalary,
    payType: effectivePayType,
    monthlySalary: effectivePayType === "MONTHLY" ? monthlySalary : 0,
    requireClockIn: effectivePayType === "MONTHLY" ? requireClockIn : false,
    needsLogin,
  };
}

type StaffShiftRateInput = { templateId: string; amount: number | null };

async function syncStaffShiftRates(
  userId: string,
  rates: StaffShiftRateInput[] | undefined,
): Promise<ActionResult | null> {
  if (!rates) return null;
  const supabase = createDb();
  for (const row of rates) {
    const templateId = String(row.templateId || "").trim();
    if (!templateId) continue;
    const raw = row.amount;
    if (raw == null || !Number.isFinite(raw) || raw < 0) {
      const { error } = await supabase
        .from("staff_shift_rates")
        .delete()
        .eq("user_id", userId)
        .eq("template_id", templateId);
      if (error) {
        return {
          ok: false,
          error: missingPaySchemaHint(error.message) ?? explainDbError(error.message, "Không xóa mức ca."),
        };
      }
      continue;
    }
    const amount = roundMoney(raw);
    const { error } = await supabase.from("staff_shift_rates").upsert(
      { user_id: userId, template_id: templateId, amount },
      { onConflict: "user_id,template_id" },
    );
    if (error) {
      return {
        ok: false,
        error: missingPaySchemaHint(error.message) ?? explainDbError(error.message, "Không lưu mức ca."),
      };
    }
  }
  return null;
}

export async function createStaff(input: {
  name: string;
  displayName: string;
  role: string;
  pinCode: string;
  customerRate: number;
  staffPayoutRate: number;
  defaultHourlySalary: number;
  payType: string;
  monthlySalary: number;
  requireClockIn: boolean;
  shiftRates?: StaffShiftRateInput[];
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  const checked = validateStaffInput(input);
  if (!checked.ok) return checked;

  const supabase = createDb();
  let pinCode = checked.pinCode;
  const payload = {
    name: checked.name,
    display_name: checked.displayName,
    role: checked.role,
    pin_code: pinCode,
    customer_rate: checked.customerRate,
    staff_payout_rate: checked.staffPayoutRate,
    default_hourly_salary: checked.defaultHourlySalary,
    pay_type: checked.payType,
    monthly_salary: checked.monthlySalary,
    require_clock_in: checked.requireClockIn,
  };

  const legacyPayload = {
    name: checked.name,
    display_name: checked.displayName,
    role: checked.role,
    pin_code: pinCode,
    customer_rate: checked.customerRate,
    staff_payout_rate: checked.staffPayoutRate,
    default_hourly_salary: checked.defaultHourlySalary,
  };

  let inserted = await supabase.from("users").insert(payload).select("id").maybeSingle();
  let error = inserted.error;

  // DB chưa có cột pay_type / monthly — vẫn thêm được NV (fallback).
  if (error && missingPaySchemaHint(error.message)) {
    inserted = await supabase.from("users").insert(legacyPayload).select("id").maybeSingle();
    error = inserted.error;
  }

  if (error?.code === "23505" && !checked.needsLogin) {
    pinCode = makeServicePin();
    inserted = await supabase
      .from("users")
      .insert({ ...payload, pin_code: pinCode })
      .select("id")
      .maybeSingle();
    error = inserted.error;
    if (error && missingPaySchemaHint(error.message)) {
      inserted = await supabase
        .from("users")
        .insert({ ...legacyPayload, pin_code: pinCode })
        .select("id")
        .maybeSingle();
      error = inserted.error;
    }
  }

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "Trùng ràng buộc dữ liệu. Nếu báo trùng PIN: chạy update_pin_not_unique.sql (PIN được phép trùng).",
      };
    }
    const hint = missingPaySchemaHint(error.message);
    if (hint) return { ok: false, error: hint };
    if (error.message.includes("display_name") || error.message.includes("customer_rate")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột nhân viên. Chạy update_display_names_rates.sql trong Supabase.",
      };
    }
    return { ok: false, error: explainDbError(error.message, "Không thêm được nhân viên.") };
  }

  const userId = inserted.data?.id ? String(inserted.data.id) : "";
  if (userId && checked.payType === "SHIFT") {
    const rateError = await syncStaffShiftRates(userId, input.shiftRates);
    // NV đã tạo — thiếu bảng rates không làm fail cả thao tác.
    if (
      rateError &&
      !rateError.ok &&
      !rateError.error.includes("update_shift_templates")
    ) {
      return rateError;
    }
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
  payType: string;
  monthlySalary: number;
  requireClockIn: boolean;
  shiftRates?: StaffShiftRateInput[];
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

  let pinCode = checked.pinCode;
  if (!checked.needsLogin && !input.pinCode.trim()) {
    const { data: existing } = await supabase
      .from("users")
      .select("pin_code")
      .eq("id", input.id)
      .maybeSingle();
    if (existing?.pin_code) pinCode = String(existing.pin_code);
  }

  const fullUpdate = {
    name: checked.name,
    display_name: checked.displayName,
    role: checked.role,
    pin_code: pinCode,
    customer_rate: checked.customerRate,
    staff_payout_rate: checked.staffPayoutRate,
    default_hourly_salary: checked.defaultHourlySalary,
    pay_type: checked.payType,
    monthly_salary: checked.monthlySalary,
    require_clock_in: checked.requireClockIn,
  };
  const legacyUpdate = {
    name: checked.name,
    display_name: checked.displayName,
    role: checked.role,
    pin_code: pinCode,
    customer_rate: checked.customerRate,
    staff_payout_rate: checked.staffPayoutRate,
    default_hourly_salary: checked.defaultHourlySalary,
  };

  let updated = await supabase
    .from("users")
    .update(fullUpdate)
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  let error = updated.error;
  if (error && missingPaySchemaHint(error.message)) {
    updated = await supabase
      .from("users")
      .update(legacyUpdate)
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    error = updated.error;
  }

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "Trùng ràng buộc dữ liệu. Nếu báo trùng PIN: chạy update_pin_not_unique.sql (PIN được phép trùng).",
      };
    }
    const hint = missingPaySchemaHint(error.message);
    if (hint) return { ok: false, error: hint };
    if (error.message.includes("display_name") || error.message.includes("customer_rate")) {
      return {
        ok: false,
        error: "Chưa cập nhật cột nhân viên. Chạy update_display_names_rates.sql trong Supabase.",
      };
    }
    return { ok: false, error: explainDbError(error.message, "Không cập nhật được nhân viên.") };
  }
  if (!updated.data) return { ok: false, error: "Không tìm thấy nhân viên." };

  if (checked.payType === "SHIFT") {
    const rateError = await syncStaffShiftRates(input.id, input.shiftRates);
    if (
      rateError &&
      !rateError.ok &&
      !rateError.error.includes("update_shift_templates")
    ) {
      return rateError;
    }
  } else {
    await supabase.from("staff_shift_rates").delete().eq("user_id", input.id);
  }

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
    return { ok: false, error: explainDbError(error.message, "Không xóa được nhân viên.") };
  }

  refresh();
  return { ok: true };
}

function validateTemplateInput(input: {
  name: string;
  startTime: string;
  endTime: string;
  payMode: string;
  defaultAmount: number;
  isActive?: boolean;
}) {
  const name = normalizeName(input.name);
  const startTime = normalizeTimeInput(input.startTime);
  const endTime = normalizeTimeInput(input.endTime);
  const payMode = String(input.payMode || "").trim();
  const defaultAmount = roundMoney(Number(input.defaultAmount) || 0);
  const isActive = input.isActive !== false;

  if (!name) return { ok: false as const, error: "Nhập tên ca." };
  if (!startTime || !endTime) {
    return { ok: false as const, error: "Giờ bắt đầu / kết thúc phải dạng HH:MM." };
  }
  if (!isShiftPayMode(payMode)) {
    return { ok: false as const, error: "Chọn kiểu trả: theo giờ hoặc cố định/ca." };
  }
  if (!Number.isFinite(defaultAmount) || defaultAmount < 0) {
    return { ok: false as const, error: "Mức lương mặc định phải ≥ 0." };
  }

  return { ok: true as const, name, startTime, endTime, payMode, defaultAmount, isActive };
}

export async function createShiftTemplate(input: {
  name: string;
  startTime: string;
  endTime: string;
  payMode: string;
  defaultAmount: number;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  const checked = validateTemplateInput(input);
  if (!checked.ok) return checked;

  const supabase = createDb();
  const { error } = await supabase.from("shift_templates").insert({
    name: checked.name,
    start_time: checked.startTime,
    end_time: checked.endTime,
    pay_mode: checked.payMode,
    default_amount: checked.defaultAmount,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Tên ca đã tồn tại." };
    const hint = missingPaySchemaHint(error.message);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: explainDbError(error.message, "Không tạo được mẫu ca.") };
  }

  refresh();
  return { ok: true };
}

export async function updateShiftTemplate(input: {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  payMode: string;
  defaultAmount: number;
  isActive: boolean;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!input.id) return { ok: false, error: "Không tìm thấy mẫu ca." };
  const checked = validateTemplateInput(input);
  if (!checked.ok) return checked;

  const supabase = createDb();
  const { data, error } = await supabase
    .from("shift_templates")
    .update({
      name: checked.name,
      start_time: checked.startTime,
      end_time: checked.endTime,
      pay_mode: checked.payMode,
      default_amount: checked.defaultAmount,
      is_active: checked.isActive,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Tên ca đã tồn tại." };
    const hint = missingPaySchemaHint(error.message);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: explainDbError(error.message, "Không cập nhật được mẫu ca.") };
  }
  if (!data) return { ok: false, error: "Không tìm thấy mẫu ca." };

  refresh();
  return { ok: true };
}

export async function deleteShiftTemplate(id: string): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "Không tìm thấy mẫu ca." };

  const supabase = createDb();
  const { error } = await supabase.from("shift_templates").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Mẫu ca đã dùng trong lịch sử — hãy tắt (ẩn) thay vì xóa.",
      };
    }
    const hint = missingPaySchemaHint(error.message);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: explainDbError(error.message, "Không xóa được mẫu ca.") };
  }

  refresh();
  return { ok: true };
}

export async function clockIn(input: {
  userId: string;
  templateId?: string;
  amount?: number;
}): Promise<ActionResult> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;
  if (!input.userId) return { ok: false, error: "Chọn nhân viên." };

  const supabase = createDb();
  const templateId = String(input.templateId ?? "").trim();
  const manual =
    input.amount != null && Number.isFinite(Number(input.amount)) ? Number(input.amount) : null;

  const { data: member, error: memberError } = await supabase
    .from("users")
    .select("role, pay_type, require_clock_in, default_hourly_salary")
    .eq("id", input.userId)
    .maybeSingle();
  if (memberError) {
    // Cột pay_type chưa có — coi như SHIFT + đọc lương giờ mặc định.
    if (!missingPaySchemaHint(memberError.message)) {
      return { ok: false, error: explainDbError(memberError.message, "Không đọc được nhân viên.") };
    }
  }

  let role = "";
  let payType = "SHIFT";
  let requireClockIn = false;
  let fallbackHourly = 0;

  if (member) {
    role = String(member.role);
    payType = String(member.pay_type ?? "SHIFT");
    requireClockIn = Boolean(member.require_clock_in);
    fallbackHourly = Number(member.default_hourly_salary) || 0;
  } else {
    const basic = await supabase
      .from("users")
      .select("role, default_hourly_salary")
      .eq("id", input.userId)
      .maybeSingle();
    if (basic.error || !basic.data) {
      return { ok: false, error: "Không tìm thấy nhân viên." };
    }
    role = String(basic.data.role);
    fallbackHourly = Number(basic.data.default_hourly_salary) || 0;
  }

  if (role === "SERVICE_STAFF") {
    return {
      ok: false,
      error: "Nhân viên phục vụ không vào ca đăng nhập — chỉ gọi vào phòng trên quầy.",
    };
  }

  let resolved: { payMode: "HOURLY" | "FIXED" | "ATTENDANCE"; rate: number; templateId: string | null };

  if (payType === "MONTHLY") {
    if (!requireClockIn) {
      return { ok: false, error: "Nhân viên lương tháng này không cần chấm công." };
    }
    resolved = { payMode: "ATTENDANCE", rate: 0, templateId: templateId || null };
  } else if (templateId) {
    const { data: template, error: templateError } = await supabase
      .from("shift_templates")
      .select("id, pay_mode, default_amount, is_active")
      .eq("id", templateId)
      .maybeSingle();
    if (templateError) {
      const hint = missingPaySchemaHint(templateError.message);
      if (hint) return { ok: false, error: hint };
      return { ok: false, error: explainDbError(templateError.message, "Không đọc được mẫu ca.") };
    }
    if (!template || template.is_active === false) {
      return { ok: false, error: "Mẫu ca không còn dùng." };
    }

    const { data: override } = await supabase
      .from("staff_shift_rates")
      .select("amount")
      .eq("user_id", input.userId)
      .eq("template_id", templateId)
      .maybeSingle();

    const rateResolved = resolveClockRate({
      payType: "SHIFT",
      requireClockIn: false,
      templatePayMode: String(template.pay_mode),
      templateDefaultAmount: Number(template.default_amount),
      staffOverrideAmount: override?.amount != null ? Number(override.amount) : null,
      manualAmount: manual,
      fallbackHourly,
    });
    if (!rateResolved.ok) return rateResolved;
    resolved = {
      payMode: rateResolved.payMode,
      rate: rateResolved.rate,
      templateId,
    };
  } else {
    // Chưa có mẫu ca — vào ca theo lương giờ (tương thích cũ).
    const rate = manual != null && manual > 0 ? roundMoney(manual) : roundMoney(fallbackHourly);
    if (rate <= 0) {
      return {
        ok: false,
        error: "Chưa có mẫu ca hoặc mức lương. Tạo mẫu ca, hoặc nhập mức lần này / lương giờ NV.",
      };
    }
    resolved = { payMode: "HOURLY", rate, templateId: null };
  }

  const { data: openShift, error: openError } = await supabase
    .from("shifts")
    .select("id")
    .eq("user_id", input.userId)
    .is("end_time", null)
    .limit(1)
    .maybeSingle();

  if (openError) {
    return { ok: false, error: explainDbError(openError.message, "Không đọc được ca.") };
  }
  if (openShift) return { ok: false, error: "Nhân viên này đang trong ca." };

  const insertFull = {
    user_id: input.userId,
    template_id: resolved.templateId,
    pay_mode: resolved.payMode,
    hourly_salary: resolved.rate,
    total_salary: null as null,
  };
  let { error } = await supabase.from("shifts").insert(insertFull);

  // Cột template_id / pay_mode chưa có — insert tối thiểu.
  if (error && missingPaySchemaHint(error.message)) {
    ({ error } = await supabase.from("shifts").insert({
      user_id: input.userId,
      hourly_salary: resolved.rate,
      total_salary: null,
    }));
  }

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Nhân viên này đang trong ca." };
    const hint = missingPaySchemaHint(error.message);
    if (hint) return { ok: false, error: hint };
    return { ok: false, error: explainDbError(error.message, "Không vào ca được.") };
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
    .select("id, start_time, hourly_salary, end_time, pay_mode")
    .eq("id", shiftId)
    .maybeSingle();

  if (shiftError) {
    return { ok: false, error: explainDbError(shiftError.message, "Không đọc được ca.") };
  }
  if (!shift) return { ok: false, error: "Không tìm thấy ca." };
  if (shift.end_time) return { ok: false, error: "Ca này đã kết thúc." };

  const end = new Date();
  const totalSalary = computeShiftTotal({
    payMode: shift.pay_mode != null ? String(shift.pay_mode) : "HOURLY",
    rate: Number(shift.hourly_salary),
    startTime: shift.start_time,
    endTime: end,
  });

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

  if (error) {
    return { ok: false, error: explainDbError(error.message, "Không ra ca được.") };
  }
  if (!closed) return { ok: false, error: "Ca này đã được chốt." };

  refresh();
  return { ok: true };
}

export { displayLabel };
