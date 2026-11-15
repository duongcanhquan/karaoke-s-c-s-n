import { Suspense } from "react";
import { LoadError } from "@/components/load-error";
import { ShiftBoard, type PayrollLine, type ShiftRow, type StaffMember } from "@/components/hr/shift-board";
import { shopBookingProfit, staffPayout } from "@/lib/billing";
import { roundMoney } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

function HrFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
      <p className="sr-only">Đang tải nhân sự</p>
    </div>
  );
}

function relatedName(value: unknown) {
  if (!value) return "Nhân viên";
  if (Array.isArray(value)) {
    const first = value[0] as { name?: string } | undefined;
    return first?.name ?? "Nhân viên";
  }
  if (typeof value === "object" && value && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return "Nhân viên";
}

async function HrContent() {
  const supabase = await createClient();
  const [staffResult, shiftResult, payResult, bookingResult] = await Promise.all([
    supabase.from("users").select("id, name, role, pin_code").order("name"),
    supabase
      .from("shifts")
      .select("id, user_id, start_time, end_time, hourly_salary, total_salary, users(name)")
      .order("start_time", { ascending: false })
      .limit(40),
    supabase
      .from("shifts")
      .select("user_id, total_salary, users(name)")
      .not("total_salary", "is", null),
    supabase
      .from("invoice_staff_bookings")
      .select(
        "staff_id, hours_worked, staff_payout_rate, profit, users(name), invoices!inner(status)",
      )
      .eq("invoices.status", "PAID"),
  ]);

  const error = staffResult.error ?? shiftResult.error ?? payResult.error ?? bookingResult.error;
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError message={error.message} />
        <ShiftBoard staff={[]} shifts={[]} payroll={[]} shopProfit={0} />
      </div>
    );
  }

  const staff: StaffMember[] = (staffResult.data ?? []).map((member) => ({
    id: String(member.id),
    name: String(member.name),
    role: String(member.role),
    pinCode: String(member.pin_code),
  }));

  const shifts: ShiftRow[] = (shiftResult.data ?? []).map((shift) => ({
    id: String(shift.id),
    userName: relatedName(shift.users),
    startTime: String(shift.start_time),
    endTime: shift.end_time ? String(shift.end_time) : null,
    hourlySalary: Number(shift.hourly_salary),
    totalSalary: shift.total_salary === null ? null : Number(shift.total_salary),
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
    if (shift.total_salary === null) continue;
    const row = payrollRow(String(shift.user_id), relatedName(shift.users));
    row.shiftPay = roundMoney(row.shiftPay + Number(shift.total_salary));
  }

  for (const booking of bookingResult.data ?? []) {
    const row = payrollRow(String(booking.staff_id), relatedName(booking.users));
    row.bookingPay = roundMoney(
      row.bookingPay + staffPayout(Number(booking.hours_worked), Number(booking.staff_payout_rate)),
    );
    shopProfit = roundMoney(
      shopProfit + shopBookingProfit(Number(booking.hours_worked), Number(booking.profit)),
    );
  }

  const payroll = [...payrollMap.values()]
    .map((line) => ({ ...line, total: roundMoney(line.shiftPay + line.bookingPay) }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  return <ShiftBoard staff={staff} shifts={shifts} payroll={payroll} shopProfit={shopProfit} />;
}

export default function HrPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lương & Nhân sự</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý nhân viên (tên + PIN), vào ca / ra ca, và hoa hồng phục vụ.
        </p>
      </div>
      <Suspense fallback={<HrFallback />}>
        <HrContent />
      </Suspense>
    </section>
  );
}
