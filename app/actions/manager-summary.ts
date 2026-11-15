"use server";

import { staffPayout } from "@/lib/billing";
import { roundMoney } from "@/lib/money";
import type { RevenuePeriod } from "@/lib/pos-types";
import {
  formatVietnamDayLabel,
  formatVietnamDayLong,
  formatVietnamMonthLabel,
  formatVietnamMonthLong,
  formatVietnamWeekLabel,
  formatVietnamWeekLong,
  vietnamDayBounds,
  vietnamMonthBounds,
  vietnamWeekBounds,
} from "@/lib/vietnam-time";
import { createClient } from "@/utils/supabase/server";

export type ManagerSummary = {
  period: RevenuePeriod;
  periodKey: string;
  label: string;
  longLabel: string;
  shiftPay: number;
  bookingPay: number;
  salaryTotal: number;
  expenseTotal: number;
  expenseCount: number;
  closedShiftCount: number;
  bookingCount: number;
  netAfterSalaryAndExpense: number;
  expenses: { id: string; title: string; category: string; amount: number; date: string }[];
  staffPayroll: {
    userId: string;
    name: string;
    shiftPay: number;
    bookingPay: number;
    total: number;
    shiftCount: number;
  }[];
};

function relatedName(value: unknown, fallback: string) {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    const first = value[0] as { name?: string } | undefined;
    return first?.name ?? fallback;
  }
  if (typeof value === "object" && value && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return fallback;
}

function periodMeta(period: RevenuePeriod, periodKey: string) {
  const bounds =
    period === "day"
      ? vietnamDayBounds(periodKey)
      : period === "week"
        ? vietnamWeekBounds(periodKey)
        : vietnamMonthBounds(periodKey);
  const label =
    period === "day"
      ? formatVietnamDayLabel(periodKey)
      : period === "week"
        ? formatVietnamWeekLabel(periodKey)
        : formatVietnamMonthLabel(periodKey);
  const longLabel =
    period === "day"
      ? formatVietnamDayLong(periodKey)
      : period === "week"
        ? formatVietnamWeekLong(periodKey)
        : formatVietnamMonthLong(periodKey);
  return { bounds, label, longLabel };
}

/** Date-only bounds for expenses.date (YYYY-MM-DD). */
function dateOnlyRange(period: RevenuePeriod, periodKey: string) {
  if (period === "day") return { start: periodKey, endExclusive: periodKey };
  if (period === "week") {
    const { mondayDate, sundayDate } = vietnamWeekBounds(periodKey);
    return { start: mondayDate, endExclusive: sundayDate };
  }
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return { start: `${periodKey}-01`, endExclusive: `${periodKey}-01` };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  // For inclusive month end we query date >= start AND date < endExclusive
  return { start, endExclusive };
}

export async function getManagerSummary(
  period: RevenuePeriod,
  periodKey: string,
): Promise<{ ok: true; data: ManagerSummary } | { ok: false; error: string }> {
  const { bounds, label, longLabel } = periodMeta(period, periodKey);
  const dateRange = dateOnlyRange(period, periodKey);
  const supabase = await createClient();

  const expensesQuery =
    period === "day"
      ? supabase
          .from("expenses")
          .select("id, title, category, amount, date")
          .eq("date", periodKey)
          .order("id", { ascending: false })
      : period === "week"
        ? supabase
            .from("expenses")
            .select("id, title, category, amount, date")
            .gte("date", dateRange.start)
            .lte("date", dateRange.endExclusive)
            .order("date", { ascending: false })
        : supabase
            .from("expenses")
            .select("id, title, category, amount, date")
            .gte("date", dateRange.start)
            .lt("date", dateRange.endExclusive)
            .order("date", { ascending: false });

  const paidInvoicesResult = await supabase
    .from("invoices")
    .select("id")
    .eq("status", "PAID")
    .gte("end_time", bounds.startIso)
    .lt("end_time", bounds.endIso);

  if (paidInvoicesResult.error) return { ok: false, error: paidInvoicesResult.error.message };
  const paidIds = (paidInvoicesResult.data ?? []).map((row) => String(row.id));

  const [shiftsResult, bookingsResult, expensesResult] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, user_id, total_salary, end_time, users(name)")
      .not("end_time", "is", null)
      .not("total_salary", "is", null)
      .gte("end_time", bounds.startIso)
      .lt("end_time", bounds.endIso),
    paidIds.length
      ? supabase
          .from("invoice_staff_bookings")
          .select("id, staff_id, hours_worked, staff_payout_rate, users(name)")
          .in("invoice_id", paidIds)
      : Promise.resolve({ data: [], error: null }),
    expensesQuery,
  ]);

  const expensesData = expensesResult.data;
  const error = shiftsResult.error ?? bookingsResult.error ?? expensesResult.error;
  if (error) return { ok: false, error: error.message };

  const payrollMap = new Map<
    string,
    {
      userId: string;
      name: string;
      shiftPay: number;
      bookingPay: number;
      total: number;
      shiftCount: number;
    }
  >();

  function row(userId: string, name: string) {
    const current = payrollMap.get(userId) ?? {
      userId,
      name,
      shiftPay: 0,
      bookingPay: 0,
      total: 0,
      shiftCount: 0,
    };
    if (name) current.name = name;
    payrollMap.set(userId, current);
    return current;
  }

  let shiftPay = 0;
  for (const shift of shiftsResult.data ?? []) {
    const amount = Number(shift.total_salary ?? 0);
    shiftPay = roundMoney(shiftPay + amount);
    const staff = row(String(shift.user_id), relatedName(shift.users, "Nhân viên"));
    staff.shiftPay = roundMoney(staff.shiftPay + amount);
    staff.shiftCount += 1;
  }

  let bookingPay = 0;
  for (const booking of bookingsResult.data ?? []) {
    const amount = staffPayout(Number(booking.hours_worked), Number(booking.staff_payout_rate));
    bookingPay = roundMoney(bookingPay + amount);
    const staff = row(String(booking.staff_id), relatedName(booking.users, "Nhân viên"));
    staff.bookingPay = roundMoney(staff.bookingPay + amount);
  }

  const expenses = (expensesData ?? []).map((expense) => ({
    id: String(expense.id),
    title: String(expense.title),
    category: String(expense.category),
    amount: Number(expense.amount),
    date: String(expense.date),
  }));
  const expenseTotal = roundMoney(expenses.reduce((sum, item) => sum + item.amount, 0));
  const salaryTotal = roundMoney(shiftPay + bookingPay);

  const staffPayroll = [...payrollMap.values()]
    .map((item) => ({
      ...item,
      total: roundMoney(item.shiftPay + item.bookingPay),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return {
    ok: true,
    data: {
      period,
      periodKey,
      label,
      longLabel,
      shiftPay,
      bookingPay,
      salaryTotal,
      expenseTotal,
      expenseCount: expenses.length,
      closedShiftCount: shiftsResult.data?.length ?? 0,
      bookingCount: bookingsResult.data?.length ?? 0,
      netAfterSalaryAndExpense: roundMoney(0 - salaryTotal - expenseTotal),
      expenses,
      staffPayroll,
    },
  };
}

export type WorkdayExportRow = {
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  hourlySalary: number;
  shiftPay: number;
};

export type JobExportRow = {
  staffName: string;
  roomName: string;
  paidAt: string;
  hoursWorked: number;
  payoutRate: number;
  bookingPay: number;
};

export async function listWorkExport(
  period: RevenuePeriod,
  periodKey: string,
): Promise<
  | { ok: true; workdays: WorkdayExportRow[]; jobs: JobExportRow[]; label: string }
  | { ok: false; error: string }
> {
  const { bounds, label } = periodMeta(period, periodKey);
  const supabase = await createClient();

  const paidInvoicesResult = await supabase
    .from("invoices")
    .select("id, end_time, rooms(name)")
    .eq("status", "PAID")
    .gte("end_time", bounds.startIso)
    .lt("end_time", bounds.endIso);

  if (paidInvoicesResult.error) return { ok: false, error: paidInvoicesResult.error.message };
  const paidInvoices = paidInvoicesResult.data ?? [];
  const paidIds = paidInvoices.map((row) => String(row.id));
  const invoiceMeta = new Map(
    paidInvoices.map((row) => [
      String(row.id),
      {
        endTime: String(row.end_time ?? ""),
        roomName: relatedName(row.rooms, "Phòng"),
      },
    ]),
  );

  const [shiftsResult, bookingsResult] = await Promise.all([
    supabase
      .from("shifts")
      .select("start_time, end_time, hourly_salary, total_salary, users(name)")
      .not("end_time", "is", null)
      .gte("end_time", bounds.startIso)
      .lt("end_time", bounds.endIso)
      .order("end_time", { ascending: true }),
    paidIds.length
      ? supabase
          .from("invoice_staff_bookings")
          .select("invoice_id, hours_worked, staff_payout_rate, users(name)")
          .in("invoice_id", paidIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = shiftsResult.error ?? bookingsResult.error;
  if (error) return { ok: false, error: error.message };

  const workdays: WorkdayExportRow[] = (shiftsResult.data ?? []).map((shift) => {
    const start = String(shift.start_time);
    const end = String(shift.end_time);
    const hours = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000);
    return {
      staffName: relatedName(shift.users, "Nhân viên"),
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
        new Date(end),
      ),
      startTime: start,
      endTime: end,
      hours: roundMoney(hours),
      hourlySalary: Number(shift.hourly_salary),
      shiftPay: Number(shift.total_salary ?? 0),
    };
  });

  const jobs: JobExportRow[] = (bookingsResult.data ?? []).map((booking) => {
    const meta = invoiceMeta.get(String(booking.invoice_id));
    return {
      staffName: relatedName(booking.users, "Nhân viên"),
      roomName: meta?.roomName ?? "Phòng",
      paidAt: meta?.endTime ?? "",
      hoursWorked: Number(booking.hours_worked),
      payoutRate: Number(booking.staff_payout_rate),
      bookingPay: staffPayout(Number(booking.hours_worked), Number(booking.staff_payout_rate)),
    };
  });

  return { ok: true, workdays, jobs, label };
}
