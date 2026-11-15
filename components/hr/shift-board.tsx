"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { selectClass } from "@/lib/field-class";
import { formatVnd } from "@/lib/money";
import { roleLabel, staffRoles, type StaffRole } from "@/lib/session";

export type HrTab = "staff" | "shifts" | "payroll";

export type StaffMember = {
  id: string;
  name: string;
  displayName: string;
  role: string;
  pinCode: string;
  customerRate: number;
  staffPayoutRate: number;
  defaultHourlySalary: number;
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
        <label htmlFor={`${idPrefix}-display`} className="text-sm font-medium">
          Tên hiển thị (hóa đơn / quầy) <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-display`}
          name="displayName"
          required
          defaultValue={member?.displayName || member?.name}
          autoComplete="off"
          className={fieldClass}
          placeholder="VD: Ngọc Anh"
        />
        <p className="text-xs text-muted-foreground">
          Tên khách thấy khi gán phục vụ — đổi được, không ảnh hưởng tên đăng nhập.
        </p>
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
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="mb-2 text-sm font-semibold">Giá phục vụ (nhân viên phục vụ)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-customer-rate`} className="text-sm font-medium">
              Giá hiển thị / khách (giờ)
            </label>
            <Input
              id={`${idPrefix}-customer-rate`}
              name="customerRate"
              type="number"
              min={0}
              step={1000}
              defaultValue={member?.customerRate ?? 0}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-payout-rate`} className="text-sm font-medium">
              Giá trả nhân viên (giờ)
            </label>
            <Input
              id={`${idPrefix}-payout-rate`}
              name="staffPayoutRate"
              type="number"
              min={0}
              step={1000}
              defaultValue={member?.staffPayoutRate ?? 0}
              className={fieldClass}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-hourly`} className="text-sm font-medium">
            Lương ca mặc định (giờ)
          </label>
          <Input
            id={`${idPrefix}-hourly`}
            name="defaultHourlySalary"
            type="number"
            min={0}
            step={1000}
            defaultValue={member?.defaultHourlySalary ?? 0}
            className={fieldClass}
          />
        </div>
      </div>
    </>
  );
}

function readStaff(data: FormData) {
  return {
    name: String(data.get("name") ?? ""),
    displayName: String(data.get("displayName") ?? ""),
    role: String(data.get("role") ?? ""),
    pinCode: String(data.get("pinCode") ?? ""),
    customerRate: Number(data.get("customerRate") ?? 0),
    staffPayoutRate: Number(data.get("staffPayoutRate") ?? 0),
    defaultHourlySalary: Number(data.get("defaultHourlySalary") ?? 0),
  };
}

export function ShiftBoard({
  staff,
  shifts,
  payroll = [],
  shopProfit = 0,
  active = "staff",
  monthLabel,
}: {
  staff: StaffMember[];
  shifts: ShiftRow[];
  payroll?: PayrollLine[];
  shopProfit?: number;
  active?: HrTab;
  monthLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") ?? (active === "staff" ? null : active);
  const current: HrTab =
    tabFromUrl === "shifts" || tabFromUrl === "payroll" ? tabFromUrl : "staff";
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
    });
  }

  return (
    <Tabs
      value={current}
      onValueChange={(value) => {
        const next =
          value === "shifts" ? "shifts" : value === "payroll" ? "payroll" : "staff";
        const href = next === "staff" ? pathname : `${pathname}?tab=${next}`;
        router.replace(href, { scroll: false });
      }}
      className="gap-4"
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
        <TabsTrigger value="staff" className="min-h-11 px-4 text-base font-bold">
          Nhân viên
        </TabsTrigger>
        <TabsTrigger value="shifts" className="min-h-11 px-4 text-base font-bold">
          Ca làm
        </TabsTrigger>
        <TabsTrigger value="payroll" className="min-h-11 px-4 text-base font-bold">
          Lương
        </TabsTrigger>
      </TabsList>

      <TabsContent value="staff" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Quản lý nhân viên</CardTitle>
          <CardDescription>
            Tên đăng nhập + PIN để vào ca. Tên hiển thị và giá phục vụ (giá khách / trả NV) dùng trên
            hóa đơn. Quản lý cũng làm thu ngân được.
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
                      <TableHead>Hiển thị / Đăng nhập</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead className="text-right">Giá khách</TableHead>
                      <TableHead className="text-right">Trả NV</TableHead>
                      <TableHead>Mã PIN</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <p className="font-medium">
                            {member.displayName || member.name}
                          </p>
                          {member.displayName && member.displayName !== member.name ? (
                            <p className="text-xs text-muted-foreground">{member.name}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>{labelRole(member.role)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatVnd(member.customerRate)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatVnd(member.staffPayoutRate)}
                        </TableCell>
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
      </TabsContent>

      <TabsContent value="payroll" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle>Lương và hoa hồng</CardTitle>
          <CardDescription>
            {monthLabel
              ? `Theo ${monthLabel} (giờ Việt Nam). Lương ca đã chốt + hoa hồng phục vụ từ hóa đơn đã thanh toán.`
              : "Lương ca đã chốt cộng tiền nhân viên nhận từ booking trên hóa đơn đã thanh toán."}{" "}
            Chi tiết theo kỳ xem Tài chính → Tổng hợp.
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
      </TabsContent>

      <TabsContent value="shifts" className="mt-0 flex flex-col gap-4">
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
                onChange={(event) => {
                  const member = staff.find((item) => item.id === event.target.value);
                  const rate = document.getElementById("shift-rate") as HTMLInputElement | null;
                  if (rate && member) {
                    rate.value = String(member.defaultHourlySalary || "");
                  }
                }}
              >
                <option value="" disabled>
                  {staff.length === 0 ? "Chưa có nhân viên" : "Chọn nhân viên"}
                </option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName || member.name} · {labelRole(member.role)}
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
                placeholder="Tự điền từ lương ca mặc định khi chọn NV"
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
      </TabsContent>

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
    </Tabs>
  );
}
