import { Suspense } from "react";
import { connection } from "next/server";
import { PanelLoading } from "@/components/admin/panel-loading";
import { LoadError } from "@/components/load-error";
import {
  ShiftBoard,
  type HrTab,
  type PayrollLine,
  type ShiftRow,
  type StaffMember,
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

  // Parallel first pass — sequential round-trips made HR feel frozen.
  const [fullStaff, shiftsRaw, payRaw, bookingsRaw] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, display_name, role, pin_code, customer_rate, staff_payout_rate, default_hourly_salary",
      )
      .order("name"),
    supabase
      .from("shifts")
      .select(
        "id, user_id, start_time, end_time, hourly_salary, total_salary, users(name, display_name)",
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
  ]);

  const staffResult = fullStaff.error
    ? await supabase.from("users").select("id, name, role, pin_code").order("name")
    : fullStaff;

  let shiftResult = looseRows(shiftsRaw);
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

  const error =
    staffResult.error ?? shiftResult.error ?? payResult.error ?? bookingResult.error;
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError
          message={error.message}
          hint="Nếu thiếu cột display_name / giá phục vụ: chạy update_display_names_rates.sql."
        />
        <ShiftBoard staff={[]} shifts={[]} payroll={[]} shopProfit={0} active={active} />
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
    };
  });

  const shifts: ShiftRow[] = (shiftResult.data ?? []).map((shift) => ({
    id: String(shift.id),
    userName: relatedDisplayName(shift.users, "Nhân viên"),
    startTime: String(shift.start_time),
    endTime: shift.end_time != null ? String(shift.end_time) : null,
    hourlySalary: Number(shift.hourly_salary),
    totalSalary: shift.total_salary == null ? null : Number(shift.total_salary),
  }));

  const payrollMap = new Map<string, PayrollLine>();
  let shopProfit = 0;

  function payrollRow(userId: string, name: string) {
    const current = payrollMap.get(userId) ?? {
      userId,
      name,
      shiftPay: 0,
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

  const payroll = [...payrollMap.values()]
    .map((line) => ({ ...line, total: roundMoney(line.shiftPay + line.bookingPay) }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return (
    <ShiftBoard
      staff={staff}
      shifts={shifts}
      payroll={payroll}
      shopProfit={shopProfit}
      active={active}
      monthLabel={monthLabel}
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
          Tên hiển thị, giá khách / trả nhân viên phục vụ, lương ca, vào/ra ca.
        </p>
      </div>
      <Suspense fallback={<HrFallback />}>
        <HrContent active={active} />
      </Suspense>
    </section>
  );
}
