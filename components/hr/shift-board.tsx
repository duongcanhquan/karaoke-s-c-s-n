"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockIn, clockOut, createStaff } from "@/app/actions/hr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatVnd } from "@/lib/money";

export type StaffMember = {
  id: string;
  name: string;
  role: string;
};

export type ShiftRow = {
  id: string;
  userName: string;
  startTime: string;
  endTime: string | null;
  hourlySalary: number;
  totalSalary: number | null;
};

export type PayrollLine = {
  userId: string;
  name: string;
  shiftPay: number;
  bookingPay: number;
  total: number;
};

const fieldClass = "min-h-11";

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

export function ShiftBoard({
  staff,
  shifts,
  payroll = [],
  shopProfit = 0,
}: {
  staff: StaffMember[];
  shifts: ShiftRow[];
  payroll?: PayrollLine[];
  shopProfit?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [staffError, setStaffError] = useState<string | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    setError: (message: string | null) => void,
    reset?: HTMLFormElement,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        toast.add({ title: "Không thực hiện được", description: result.error, type: "error" });
        return;
      }
      reset?.reset();
      toast.add({ title: success, type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Lương và hoa hồng</CardTitle>
          <CardDescription>
            Lương ca đã chốt cộng tiền nhân viên nhận từ booking trên hóa đơn PAID.
            Lợi nhuận quán là phần khách trả trừ phần trả nhân viên.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl>
            <div className="flex justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">Lợi nhuận quán từ booking</dt>
              <dd className="font-mono text-base font-semibold tabular-nums">{formatVnd(shopProfit)}</dd>
            </div>
          </dl>
          {payroll.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có lương ca hoặc hoa hồng từ hóa đơn đã thanh toán.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead className="text-right">Lương ca</TableHead>
                  <TableHead className="text-right">Hoa hồng booking</TableHead>
                  <TableHead className="text-right">Tổng nhận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payroll.map((line) => (
                  <TableRow key={line.userId}>
                    <TableCell>{line.name}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(line.shiftPay)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(line.bookingPay)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(line.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thêm nhân viên</CardTitle>
            <CardDescription>PIN dùng để phân biệt người chấm công.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                run(
                  () =>
                    createStaff({
                      name: String(data.get("name") ?? ""),
                      role: String(data.get("role") ?? ""),
                      pinCode: String(data.get("pinCode") ?? ""),
                    }),
                  "Đã thêm nhân viên",
                  setStaffError,
                  form,
                );
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="staff-name" className="text-sm font-medium">
                  Tên <span aria-hidden="true">*</span>
                </label>
                <Input id="staff-name" name="name" required className={fieldClass} autoComplete="name" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="staff-role" className="text-sm font-medium">
                  Vai trò <span aria-hidden="true">*</span>
                </label>
                <Input id="staff-role" name="role" required defaultValue="Nhân viên" className={fieldClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="staff-pin" className="text-sm font-medium">
                  PIN <span aria-hidden="true">*</span>
                </label>
                <Input id="staff-pin" name="pinCode" required inputMode="numeric" autoComplete="off" className={fieldClass} />
              </div>
              {staffError ? (
                <p role="alert" className="text-sm text-destructive">
                  {staffError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11" disabled={pending}>
                {pending ? "Đang lưu" : "Lưu nhân viên"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vào ca</CardTitle>
            <CardDescription>Mỗi người chỉ có một ca đang mở.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                run(
                  () =>
                    clockIn({
                      userId: String(data.get("userId") ?? ""),
                      hourlySalary: Number(data.get("hourlySalary")),
                    }),
                  "Đã vào ca",
                  setShiftError,
                );
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="shift-user" className="text-sm font-medium">
                  Nhân viên <span aria-hidden="true">*</span>
                </label>
                <select
                  id="shift-user"
                  name="userId"
                  required
                  disabled={staff.length === 0}
                  defaultValue=""
                  className="min-h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
                >
                  <option value="" disabled>
                    {staff.length === 0 ? "Chưa có nhân viên" : "Chọn nhân viên"}
                  </option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="shift-rate" className="text-sm font-medium">
                  Lương giờ (VND) <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="shift-rate"
                  name="hourlySalary"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  required
                  className={fieldClass}
                />
              </div>
              {shiftError ? (
                <p role="alert" className="text-sm text-destructive">
                  {shiftError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11" disabled={pending || staff.length === 0}>
                Clock In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ca làm</CardTitle>
          <CardDescription>Clock Out tính lương theo số giờ thực tế.</CardDescription>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có ca nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead>Vào</TableHead>
                  <TableHead>Ra</TableHead>
                  <TableHead className="text-right">Lương giờ</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell>{shift.userName}</TableCell>
                    <TableCell>{formatWhen(shift.startTime)}</TableCell>
                    <TableCell>{shift.endTime ? formatWhen(shift.endTime) : "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(shift.hourlySalary)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {shift.totalSalary === null ? "—" : formatVnd(shift.totalSalary)}
                    </TableCell>
                    <TableCell>
                      {shift.endTime ? (
                        "Đã ra ca"
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={pending}
                          onClick={() =>
                            run(() => clockOut(shift.id), "Đã ra ca", setShiftError)
                          }
                        >
                          Clock Out
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
