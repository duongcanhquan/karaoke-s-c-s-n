import { Suspense } from "react";
import { connection } from "next/server";
import { PanelLoading } from "@/components/admin/panel-loading";
import { LoadError } from "@/components/load-error";
import {
  ShiftBoard,
  type HrTab,
  type PayrollLine,
  type ShiftRow,
  type ShiftTemplate,
  type StaffMember,
  type StaffShiftRate,
} from "@/components/hr/shift-board";
import { shopBookingProfit, staffPayout } from "@/lib/billing";
import { displayLabel, relatedDisplayName } from "@/lib/display-name";
import { roundMoney } from "@/lib/money";
import { isMissingDisplayNameError, looseRows } from "@/lib/supabase-errors";
import {
  currentVietnamYearMonth,
  formatVietnamMonthLabel,
  vietnamMonthBounds,
} from "@/lib/vietnam-time";
import { createDb } from "@/utils/supabase/db";

function HrFallback() {
  return <PanelLoading label="Đang tải nhân sự…" />;
}

function resolveHrTab(tab: string | undefined): HrTab {
  if (tab === "shifts") return "shifts";
  if (tab === "payroll") return "payroll";
  return "staff";
}

async function HrContent({ active }: { active: HrTab }) {
  await connection();
  const monthKey = currentVietnamYearMonth();
  const monthLabel = formatVietnamMonthLabel(monthKey);
  const { startIso, endIso } = vietnamMonthBounds(monthKey);
  const supabase = createDb();

  const [fullStaff, shiftsRaw, payRaw, bookingsRaw, templatesRaw, ratesRaw] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, display_name, role, pin_code, customer_rate, staff_payout_rate, default_hourly_salary, pay_type, monthly_salary, require_clock_in",
      )
      .order("name"),
    supabase
      .from("shifts")
      .select(
        "id, user_id, start_time, end_time, hourly_salary, total_salary, pay_mode, template_id, users(name, display_name), shift_templates(name)",
      )
      .order("start_time", { ascending: false })
      .limit(40),
    supabase
      .from("shifts")
      .select("user_id, total_salary, users(name, display_name)")
      .not("total_salary", "is", null)
      .gte("end_time", startIso)
      .lt("end_time", endIso),
    supabase
      .from("invoice_staff_bookings")
      .select(
        "staff_id, hours_worked, staff_payout_rate, profit, users(name, display_name), invoices!inner(status, end_time)",
      )
      .eq("invoices.status", "PAID")
      .gte("invoices.end_time", startIso)
      .lt("invoices.end_time", endIso),
    supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time, pay_mode, default_amount, is_active")
      .order("start_time"),
    supabase.from("staff_shift_rates").select("user_id, template_id, amount"),
  ]);

  const staffResult = fullStaff.error
    ? await supabase.from("users").select("id, name, role, pin_code").order("name")
    : fullStaff;

  let shiftResult = looseRows(shiftsRaw);
  if (shiftResult.error) {
    shiftResult = looseRows(
      await supabase
        .from("shifts")
        .select(
          "id, user_id, start_time, end_time, hourly_salary, total_salary, users(name, display_name)",
        )
        .order("start_time", { ascending: false })
        .limit(40),
    );
  }
  if (isMissingDisplayNameError(shiftResult.error?.message)) {
    shiftResult = looseRows(
      await supabase
        .from("shifts")
        .select("id, user_id, start_time, end_time, hourly_salary, total_salary, users(name)")
        .order("start_time", { ascending: false })
        .limit(40),
    );
  }

  let payResult = looseRows(payRaw);
  if (isMissingDisplayNameError(payResult.error?.message)) {
    payResult = looseRows(
      await supabase
        .from("shifts")
        .select("user_id, total_salary, users(name)")
        .not("total_salary", "is", null)
        .gte("end_time", startIso)
        .lt("end_time", endIso),
    );
  }

  let bookingResult = looseRows(bookingsRaw);
  if (isMissingDisplayNameError(bookingResult.error?.message)) {
    bookingResult = looseRows(
      await supabase
        .from("invoice_staff_bookings")
        .select(
          "staff_id, hours_worked, staff_payout_rate, profit, users(name), invoices!inner(status, end_time)",
        )
        .eq("invoices.status", "PAID")
        .gte("invoices.end_time", startIso)
        .lt("invoices.end_time", endIso),
    );
  }

  const templatesMissing = Boolean(templatesRaw.error);
  const templates: ShiftTemplate[] = templatesMissing
    ? []
    : (templatesRaw.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        startTime: String(row.start_time),
        endTime: String(row.end_time),
        payMode: String(row.pay_mode),
        defaultAmount: Number(row.default_amount ?? 0),
        isActive: row.is_active !== false,
      }));

  const shiftRates: StaffShiftRate[] = ratesRaw.error
    ? []
    : (ratesRaw.data ?? []).map((row) => ({
        userId: String(row.user_id),
        templateId: String(row.template_id),
        amount: Number(row.amount ?? 0),
      }));

  const error =
    staffResult.error ?? shiftResult.error ?? payResult.error ?? bookingResult.error;
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError
          message={error.message}
          hint={
            templatesMissing
              ? "Chạy update_shift_templates.sql trong Supabase (mẫu ca + lương tháng)."
              : "Nếu thiếu cột display_name / giá phục vụ: chạy update_display_names_rates.sql."
          }
        />
        <ShiftBoard
          staff={[]}
          shifts={[]}
          templates={[]}
          shiftRates={[]}
          payroll={[]}
          shopProfit={0}
          active={active}
        />
      </div>
    );
  }

  const staff: StaffMember[] = (staffResult.data ?? []).map((member) => {
    const row = member as Record<string, unknown>;
    return {
      id: String(row.id),
      name: String(row.name),
      displayName: displayLabel(String(row.name), row.display_name as string | undefined),
      role: String(row.role),
      pinCode: String(row.pin_code),
      customerRate: Number(row.customer_rate ?? 0),
      staffPayoutRate: Number(row.staff_payout_rate ?? 0),
      defaultHourlySalary: Number(row.default_hourly_salary ?? 0),
      payType: String(row.pay_type ?? "SHIFT"),
      monthlySalary: Number(row.monthly_salary ?? 0),
      requireClockIn: Boolean(row.require_clock_in),
    };
  });

  const shifts: ShiftRow[] = (shiftResult.data ?? []).map((shift) => {
    const row = shift as Record<string, unknown>;
    const templateRel = row.shift_templates as { name?: string } | null | undefined;
    return {
      id: String(shift.id),
      userName: relatedDisplayName(shift.users, "Nhân viên"),
      templateName: templateRel?.name ? String(templateRel.name) : null,
      startTime: String(shift.start_time),
      endTime: shift.end_time != null ? String(shift.end_time) : null,
      payMode: row.pay_mode != null ? String(row.pay_mode) : "HOURLY",
      hourlySalary: Number(shift.hourly_salary),
      totalSalary: shift.total_salary == null ? null : Number(shift.total_salary),
    };
  });

  const payrollMap = new Map<string, PayrollLine>();
  let shopProfit = 0;

  function payrollRow(userId: string, name: string) {
    const current = payrollMap.get(userId) ?? {
      userId,
      name,
      shiftPay: 0,
      monthlyPay: 0,
      bookingPay: 0,
      total: 0,
    };
    if (name) current.name = name;
    payrollMap.set(userId, current);
    return current;
  }

  for (const shift of payResult.data ?? []) {
    if (shift.total_salary == null) continue;
    const row = payrollRow(
      String(shift.user_id),
      relatedDisplayName(shift.users, "Nhân viên"),
    );
    row.shiftPay = roundMoney(row.shiftPay + Number(shift.total_salary));
  }

  for (const booking of bookingResult.data ?? []) {
    const row = payrollRow(
      String(booking.staff_id),
      relatedDisplayName(booking.users, "Nhân viên"),
    );
    row.bookingPay = roundMoney(
      row.bookingPay +
        staffPayout(Number(booking.hours_worked), Number(booking.staff_payout_rate)),
    );
    shopProfit = roundMoney(
      shopProfit + shopBookingProfit(Number(booking.hours_worked), Number(booking.profit)),
    );
  }

  for (const member of staff) {
    if (member.payType !== "MONTHLY" || member.monthlySalary <= 0) continue;
    if (member.role === "SERVICE_STAFF") continue;
    const row = payrollRow(member.id, member.displayName || member.name);
    row.monthlyPay = roundMoney(member.monthlySalary);
  }

  const payroll = [...payrollMap.values()]
    .map((line) => ({
      ...line,
      total: roundMoney(line.shiftPay + line.monthlyPay + line.bookingPay),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return (
    <ShiftBoard
      staff={staff}
      shifts={shifts}
      templates={templates}
      shiftRates={shiftRates}
      payroll={payroll}
      shopProfit={shopProfit}
      active={active}
      monthLabel={monthLabel}
      schemaHint={
        templatesMissing
          ? "Chưa có bảng mẫu ca — chạy update_shift_templates.sql trong Supabase."
          : null
      }
    />
  );
}

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const active = resolveHrTab(params.tab);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lương &amp; Nhân sự</h1>
        <p className="text-sm text-muted-foreground">
          Mẫu ca (giờ + cách tính tiền), lương theo ca hoặc theo tháng, vào/ra ca.
        </p>
      </div>
      <Suspense fallback={<HrFallback />}>
        <HrContent active={active} />
      </Suspense>
    </section>
  );
}
