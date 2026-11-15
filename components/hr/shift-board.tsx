"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockIn, clockOut, createStaff, deleteStaff, updateStaff } from "@/app/actions/hr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { selectClass } from "@/lib/field-class";
import { formatVnd } from "@/lib/money";
import { roleLabel, staffRoles, type StaffRole } from "@/lib/session";

export type StaffMember = {
  id: string;
  name: string;
  role: string;
  pinCode: string;
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

function labelRole(role: string) {
  return roleLabel[role as StaffRole] ?? role;
}

function StaffFields({
  idPrefix,
  member,
}: {
  idPrefix: string;
  member?: StaffMember;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
          Tên đăng nhập <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          defaultValue={member?.name}
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-role`} className="text-sm font-medium">
          Vai trò <span aria-hidden="true">*</span>
        </label>
        <select
          id={`${idPrefix}-role`}
          name="role"
          required
          defaultValue={member?.role ?? "SERVICE_STAFF"}
          className={selectClass}
        >
          {staffRoles.map((role) => (
            <option key={role} value={role}>
              {roleLabel[role]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-pin`} className="text-sm font-medium">
          Mã PIN (4–8 số) <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-pin`}
          name="pinCode"
          required
          inputMode="numeric"
          pattern="\d{4,8}"
          autoComplete="off"
          defaultValue={member?.pinCode}
          className={fieldClass}
        />
      </div>
    </>
  );
}

function readStaff(data: FormData) {
  return {
    name: String(data.get("name") ?? ""),
    role: String(data.get("role") ?? ""),
    pinCode: String(data.get("pinCode") ?? ""),
  };
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
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [deletePin, setDeletePin] = useState("");

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    setError: (message: string | null) => void,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        toast.add({ title: "Không thực hiện được", description: result.error, type: "error" });
        return;
      }
      after?.();
      toast.add({ title: success, type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Quản lý nhân viên</CardTitle>
          <CardDescription>
            Mỗi người đăng nhập bằng đúng tên + mã PIN. Quản lý vào bảng điều khiển; thu ngân / phục vụ vào quầy.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const input = readStaff(new FormData(form));
              run(() => createStaff(input), "Đã thêm nhân viên", setStaffError, () => form.reset());
            }}
          >
            <p className="text-sm font-semibold text-slate-900">Thêm nhân viên</p>
            <StaffFields idPrefix="create" />
            {staffError && !editing && !removing ? (
              <p role="alert" className="text-sm text-destructive">
                {staffError}
              </p>
            ) : null}
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? "Đang lưu" : "Lưu nhân viên"}
            </Button>
          </form>

          <div className="min-w-0">
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có nhân viên.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Mã PIN</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{labelRole(member.role)}</TableCell>
                        <TableCell className="font-mono tabular-nums tracking-widest">
                          {member.pinCode}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              disabled={pending}
                              onClick={() => {
                                setStaffError(null);
                                setEditing(member);
                              }}
                            >
                              Sửa
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              className="min-h-11"
                              disabled={pending}
                              onClick={() => {
                                setStaffError(null);
                                setRemoving(member);
                              }}
                            >
                              Xóa
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lương và hoa hồng</CardTitle>
          <CardDescription>
            Lương ca đã chốt cộng tiền nhân viên nhận từ booking trên hóa đơn đã thanh toán.
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
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead className="text-right">Lương ca</TableHead>
                    <TableHead className="text-right">Hoa hồng phục vụ</TableHead>
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vào ca</CardTitle>
          <CardDescription>Mỗi người chỉ có một ca đang mở.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid max-w-xl gap-3 sm:grid-cols-2"
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
                () => form.reset(),
              );
            }}
          >
            <div className="flex flex-col gap-1 sm:col-span-2">
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
                    {member.name} · {labelRole(member.role)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
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
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {shiftError}
              </p>
            ) : null}
            <Button
              type="submit"
              className="min-h-11 sm:col-span-2"
              disabled={pending || staff.length === 0}
            >
              Vào ca
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ca làm</CardTitle>
          <CardDescription>Ra ca tính lương theo số giờ thực tế.</CardDescription>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có ca nào.</p>
          ) : (
            <div className="w-full overflow-x-auto">
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
                            Ra ca
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa nhân viên</DialogTitle>
            <DialogDescription>
              Đổi tên hoặc mã PIN sẽ áp dụng ngay cho lần đăng nhập tiếp theo.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              key={editing.id}
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const input = readStaff(new FormData(event.currentTarget));
                run(
                  () => updateStaff({ id: editing.id, ...input }),
                  "Đã cập nhật nhân viên",
                  setStaffError,
                  () => setEditing(null),
                );
              }}
            >
              <StaffFields idPrefix="edit" member={editing} />
              {staffError ? (
                <p role="alert" className="text-sm text-destructive">
                  {staffError}
                </p>
              ) : null}
              <DialogFooter className="gap-2 sm:flex-col">
                <Button type="submit" className="min-h-11 w-full" disabled={pending}>
                  {pending ? "Đang lưu" : "Lưu thay đổi"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  disabled={pending}
                  onClick={() => setEditing(null)}
                >
                  Hủy
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setDeletePin("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa nhân viên?</DialogTitle>
            <DialogDescription>
              {removing
                ? `Xóa “${removing.name}” — cần PIN quản lý. Không xóa được nếu đã có ca hoặc lịch phục vụ.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="PIN quản lý"
            value={deletePin}
            onChange={(event) => setDeletePin(event.target.value)}
            className="min-h-12 text-center text-xl font-bold tracking-[0.3em]"
          />
          {staffError ? (
            <p role="alert" className="text-sm text-destructive">
              {staffError}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:flex-col">
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full"
              disabled={pending || !removing || !deletePin.trim()}
              onClick={() => {
                if (!removing) return;
                const pin = deletePin.trim();
                run(
                  () => deleteStaff(removing.id, pin),
                  "Đã xóa nhân viên",
                  setStaffError,
                  () => {
                    setRemoving(null);
                    setDeletePin("");
                  },
                );
              }}
            >
              Xóa
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={pending}
              onClick={() => {
                setRemoving(null);
                setDeletePin("");
              }}
            >
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
