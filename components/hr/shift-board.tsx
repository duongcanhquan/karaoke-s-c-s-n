"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  clockIn,
  clockOut,
  createShiftTemplate,
  createStaff,
  deleteShiftTemplate,
  deleteStaff,
  updateShiftTemplate,
  updateStaff,
} from "@/app/actions/hr";
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
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useOptimisticTab } from "@/lib/use-optimistic-tab";
import { toast } from "@/components/ui/toast";
import { selectClass } from "@/lib/field-class";
import { formatVnd } from "@/lib/money";
import { roleLabel, staffRoles, type StaffRole } from "@/lib/session";
import {
  formatClockTime,
  payTypeLabel,
  shiftPayModeLabel,
  staffPayTypes,
  type StaffPayType,
} from "@/lib/shift-pay";

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
  payType: string;
  monthlySalary: number;
  requireClockIn: boolean;
};

export type ShiftTemplate = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  payMode: string;
  defaultAmount: number;
  isActive: boolean;
};

export type StaffShiftRate = {
  userId: string;
  templateId: string;
  amount: number;
};

export type ShiftRow = {
  id: string;
  userName: string;
  templateName: string | null;
  startTime: string;
  endTime: string | null;
  payMode: string;
  hourlySalary: number;
  totalSalary: number | null;
};

export type PayrollLine = {
  userId: string;
  name: string;
  shiftPay: number;
  monthlyPay: number;
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

function labelPayMode(mode: string) {
  if (mode === "ATTENDANCE") return "Chấm công";
  if (mode === "FIXED") return shiftPayModeLabel.FIXED;
  return shiftPayModeLabel.HOURLY;
}

function canClockStaff(member: StaffMember) {
  if (member.role === "SERVICE_STAFF") return false;
  if (member.role !== "ADMIN" && member.role !== "CASHIER") return false;
  if (member.payType === "MONTHLY") return member.requireClockIn;
  return true;
}

function readShiftRates(data: FormData, templates: ShiftTemplate[]) {
  return templates.map((template) => {
    const raw = String(data.get(`rate_${template.id}`) ?? "").trim();
    if (!raw) return { templateId: template.id, amount: null as number | null };
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      return { templateId: template.id, amount: null };
    }
    return { templateId: template.id, amount };
  });
}

function readStaff(data: FormData, templates: ShiftTemplate[]) {
  return {
    name: String(data.get("name") ?? ""),
    displayName: String(data.get("displayName") ?? ""),
    role: String(data.get("role") ?? ""),
    pinCode: String(data.get("pinCode") ?? ""),
    customerRate: Number(data.get("customerRate") ?? 0),
    staffPayoutRate: Number(data.get("staffPayoutRate") ?? 0),
    defaultHourlySalary: Number(data.get("defaultHourlySalary") ?? 0),
    payType: String(data.get("payType") ?? "SHIFT"),
    monthlySalary: Number(data.get("monthlySalary") ?? 0),
    requireClockIn: data.get("requireClockIn") === "on" || data.get("requireClockIn") === "true",
    shiftRates: readShiftRates(data, templates),
  };
}

function StaffFields({
  idPrefix,
  member,
  templates,
  shiftRates,
}: {
  idPrefix: string;
  member?: StaffMember;
  templates: ShiftTemplate[];
  shiftRates: StaffShiftRate[];
}) {
  const initialRole =
    member && staffRoles.includes(member.role as StaffRole)
      ? (member.role as StaffRole)
      : "SERVICE_STAFF";
  const [role, setRole] = useState<StaffRole>(initialRole);
  const [payType, setPayType] = useState<StaffPayType>(
    member?.payType === "MONTHLY" ? "MONTHLY" : "SHIFT",
  );

  const needsLogin = role === "ADMIN" || role === "CASHIER";
  const isService = role === "SERVICE_STAFF";
  const showPaySetup = needsLogin;
  const activeTemplates = templates.filter((t) => t.isActive);

  const rateMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of shiftRates) {
      if (member && row.userId === member.id) map.set(row.templateId, row.amount);
    }
    return map;
  }, [member, shiftRates]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-role`} className="text-sm font-medium">
          Vai trò <span aria-hidden="true">*</span>
        </label>
        <select
          id={`${idPrefix}-role`}
          name="role"
          required
          value={role}
          onChange={(event) => {
            const next = event.target.value as StaffRole;
            setRole(next);
            if (next === "SERVICE_STAFF") setPayType("SHIFT");
          }}
          className={selectClass}
        >
          {staffRoles.map((item) => (
            <option key={item} value={item}>
              {roleLabel[item]}
            </option>
          ))}
        </select>
        {isService ? (
          <p className="text-xs text-muted-foreground">
            Không đăng nhập — chỉ gọi vào phòng trên quầy thu ngân.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Có tài khoản đăng nhập quầy{role === "ADMIN" ? " / quản lý" : ""}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
          {needsLogin ? "Tên đăng nhập" : "Tên nhân viên"}{" "}
          <span aria-hidden="true">*</span>
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
      </div>

      {needsLogin ? (
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
            defaultValue={
              member?.role === "ADMIN" || member?.role === "CASHIER" ? member.pinCode : ""
            }
            className={fieldClass}
          />
        </div>
      ) : (
        <input type="hidden" name="pinCode" value="" />
      )}

      {showPaySetup ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-semibold">Chế độ lương</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-pay-type`} className="text-sm font-medium">
              Cách tính
            </label>
            <select
              id={`${idPrefix}-pay-type`}
              name="payType"
              value={payType}
              onChange={(event) => setPayType(event.target.value as StaffPayType)}
              className={selectClass}
            >
              {staffPayTypes.map((item) => (
                <option key={item} value={item}>
                  {payTypeLabel[item]}
                </option>
              ))}
            </select>
          </div>

          {payType === "MONTHLY" ? (
            <>
              <div className="mt-3 flex flex-col gap-1">
                <label htmlFor={`${idPrefix}-monthly`} className="text-sm font-medium">
                  Lương tháng (VND) <span aria-hidden="true">*</span>
                </label>
                <Input
                  id={`${idPrefix}-monthly`}
                  name="monthlySalary"
                  type="number"
                  min={0}
                  step={1000}
                  required
                  defaultValue={member?.monthlySalary || ""}
                  className={fieldClass}
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="requireClockIn"
                  defaultChecked={member?.requireClockIn}
                  className="size-4"
                />
                Cần chấm công (điểm danh, không tính tiền theo ca)
              </label>
              <input type="hidden" name="defaultHourlySalary" value={0} />
            </>
          ) : (
            <>
              <input type="hidden" name="monthlySalary" value={0} />
              <div className="mt-3 flex flex-col gap-1">
                <label htmlFor={`${idPrefix}-hourly`} className="text-sm font-medium">
                  Lương giờ dự phòng (khi mẫu ca chưa có mức)
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
              {activeTemplates.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-sm font-medium">Mức riêng theo mẫu ca (để trống = mặc định ca)</p>
                  {activeTemplates.map((template) => (
                    <div key={template.id} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {template.name} · {formatClockTime(template.startTime)}–
                        {formatClockTime(template.endTime)} ·{" "}
                        {labelPayMode(template.payMode)} {formatVnd(template.defaultAmount)}
                      </span>
                      <Input
                        name={`rate_${template.id}`}
                        type="number"
                        min={0}
                        step={1000}
                        defaultValue={rateMap.get(template.id) ?? ""}
                        className={fieldClass}
                        placeholder="Mặc định"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Chưa có mẫu ca — tạo ở tab Ca làm.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <input type="hidden" name="payType" value="SHIFT" />
          <input type="hidden" name="monthlySalary" value={0} />
          <input type="hidden" name="defaultHourlySalary" value={0} />
        </>
      )}

      {isService ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-semibold">Giá phục vụ</p>
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
        </div>
      ) : (
        <>
          <input type="hidden" name="customerRate" value={member?.customerRate ?? 0} />
          <input type="hidden" name="staffPayoutRate" value={member?.staffPayoutRate ?? 0} />
        </>
      )}
    </>
  );
}

function TemplateFields({
  idPrefix,
  template,
}: {
  idPrefix: string;
  template?: ShiftTemplate;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
          Tên ca <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          defaultValue={template?.name}
          className={fieldClass}
          placeholder="Ca sáng / Ca tối"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-start`} className="text-sm font-medium">
            Từ giờ <span aria-hidden="true">*</span>
          </label>
          <Input
            id={`${idPrefix}-start`}
            name="startTime"
            type="time"
            required
            defaultValue={formatClockTime(template?.startTime ?? "08:00")}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-end`} className="text-sm font-medium">
            Đến giờ <span aria-hidden="true">*</span>
          </label>
          <Input
            id={`${idPrefix}-end`}
            name="endTime"
            type="time"
            required
            defaultValue={formatClockTime(template?.endTime ?? "17:00")}
            className={fieldClass}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Nếu giờ kết thúc ≤ giờ bắt đầu thì ca qua đêm (vd. 22:00–06:00).
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-mode`} className="text-sm font-medium">
          Cách tính tiền <span aria-hidden="true">*</span>
        </label>
        <select
          id={`${idPrefix}-mode`}
          name="payMode"
          required
          defaultValue={template?.payMode ?? "HOURLY"}
          className={selectClass}
        >
          <option value="HOURLY">{shiftPayModeLabel.HOURLY}</option>
          <option value="FIXED">{shiftPayModeLabel.FIXED}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-amount`} className="text-sm font-medium">
          Mức mặc định (VND) <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-amount`}
          name="defaultAmount"
          type="number"
          min={0}
          step={1000}
          required
          defaultValue={template?.defaultAmount ?? 0}
          className={fieldClass}
        />
      </div>
      {template ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={template.isActive}
            className="size-4"
          />
          Đang dùng
        </label>
      ) : null}
    </>
  );
}

export function ShiftBoard({
  staff,
  shifts,
  templates = [],
  shiftRates = [],
  payroll = [],
  shopProfit = 0,
  active = "staff",
  monthLabel,
  schemaHint = null,
}: {
  staff: StaffMember[];
  shifts: ShiftRow[];
  templates?: ShiftTemplate[];
  shiftRates?: StaffShiftRate[];
  payroll?: PayrollLine[];
  shopProfit?: number;
  active?: HrTab;
  monthLabel?: string;
  schemaHint?: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") ?? (active === "staff" ? null : active);
  const serverTab: HrTab =
    tabFromUrl === "shifts" || tabFromUrl === "payroll" ? tabFromUrl : "staff";
  const { tab: current, select } = useOptimisticTab(serverTab, (next) =>
    next === "staff" ? pathname : `${pathname}?tab=${next}`,
  );
  const [pending, startTransition] = useTransition();
  const [staffError, setStaffError] = useState<string | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [createFormKey, setCreateFormKey] = useState(0);
  const [templateFormKey, setTemplateFormKey] = useState(0);
  const [clockUserId, setClockUserId] = useState("");
  const [clockTemplateId, setClockTemplateId] = useState("");

  const clockable = staff.filter(canClockStaff);
  const activeTemplates = templates.filter((t) => t.isActive);

  const previewRate = useMemo(() => {
    const member = staff.find((item) => item.id === clockUserId);
    const template = templates.find((item) => item.id === clockTemplateId);
    if (!member || !template) return null;
    if (member.payType === "MONTHLY") return { label: "Chấm công", amount: 0 };
    const override = shiftRates.find(
      (row) => row.userId === member.id && row.templateId === template.id,
    );
    const amount = override?.amount ?? template.defaultAmount;
    return {
      label: labelPayMode(template.payMode),
      amount,
    };
  }, [clockTemplateId, clockUserId, shiftRates, staff, templates]);

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
        select(value === "shifts" ? "shifts" : value === "payroll" ? "payroll" : "staff");
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="staff">Nhân viên</AdminTabsTrigger>
        <AdminTabsTrigger value="shifts">Ca làm</AdminTabsTrigger>
        <AdminTabsTrigger value="payroll">Lương</AdminTabsTrigger>
      </AdminTabsList>

      {schemaHint ? (
        <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {schemaHint}
        </p>
      ) : null}

      <TabsContent value="staff" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Quản lý nhân viên</CardTitle>
            <CardDescription>
              Quản lý / Thu ngân: đăng nhập + chế độ lương (theo ca hoặc tháng). Phục vụ: chỉ gọi
              vào phòng.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <form
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const input = readStaff(new FormData(form), templates);
                run(() => createStaff(input), "Đã thêm nhân viên", setStaffError, () => {
                  form.reset();
                  setCreateFormKey((key) => key + 1);
                });
              }}
            >
              <p className="text-sm font-semibold text-foreground">Thêm nhân viên</p>
              <StaffFields
                key={createFormKey}
                idPrefix="create"
                templates={templates}
                shiftRates={[]}
              />
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
                        <TableHead>Lương</TableHead>
                        <TableHead>Mã PIN</TableHead>
                        <TableHead>Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <p className="font-medium">{member.displayName || member.name}</p>
                            {member.displayName && member.displayName !== member.name ? (
                              <p className="text-xs text-muted-foreground">{member.name}</p>
                            ) : null}
                          </TableCell>
                          <TableCell>{labelRole(member.role)}</TableCell>
                          <TableCell className="text-sm">
                            {member.role === "SERVICE_STAFF" ? (
                              <span className="text-muted-foreground">Gọi phòng</span>
                            ) : member.payType === "MONTHLY" ? (
                              <>
                                Tháng · {formatVnd(member.monthlySalary)}
                                {member.requireClockIn ? (
                                  <span className="block text-xs text-muted-foreground">
                                    Có chấm công
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <>Theo ca</>
                            )}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums tracking-widest">
                            {member.role === "SERVICE_STAFF" ? "—" : member.pinCode}
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
                ? `Theo ${monthLabel} (giờ Việt Nam). Lương ca đã chốt + lương tháng + hoa hồng phục vụ.`
                : "Lương ca / tháng + hoa hồng từ hóa đơn đã thanh toán."}{" "}
              Chi tiết theo kỳ xem Tài chính → Tổng hợp.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl>
              <div className="flex justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">Lợi nhuận quán từ booking</dt>
                <dd className="font-mono text-base font-semibold tabular-nums">
                  {formatVnd(shopProfit)}
                </dd>
              </div>
            </dl>
            {payroll.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có lương ca, lương tháng hoặc hoa hồng.
              </p>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nhân viên</TableHead>
                      <TableHead className="text-right">Lương ca</TableHead>
                      <TableHead className="text-right">Lương tháng</TableHead>
                      <TableHead className="text-right">Hoa hồng</TableHead>
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
                          {formatVnd(line.monthlyPay)}
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
            <CardTitle>Cấu hình mẫu ca</CardTitle>
            <CardDescription>
              Đặt khung giờ và cách tính tiền mặc định (theo giờ hoặc cố định/ca).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <form
              key={templateFormKey}
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                run(
                  () =>
                    createShiftTemplate({
                      name: String(data.get("name") ?? ""),
                      startTime: String(data.get("startTime") ?? ""),
                      endTime: String(data.get("endTime") ?? ""),
                      payMode: String(data.get("payMode") ?? ""),
                      defaultAmount: Number(data.get("defaultAmount") ?? 0),
                    }),
                  "Đã thêm mẫu ca",
                  setTemplateError,
                  () => {
                    form.reset();
                    setTemplateFormKey((key) => key + 1);
                  },
                );
              }}
            >
              <p className="text-sm font-semibold">Thêm mẫu ca</p>
              <TemplateFields idPrefix="tpl-create" />
              {templateError && !editingTemplate ? (
                <p role="alert" className="text-sm text-destructive">
                  {templateError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11" disabled={pending}>
                Lưu mẫu ca
              </Button>
            </form>

            <div className="min-w-0">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có mẫu ca. Thêm ca sáng / ca tối trước khi vào ca.
                </p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên</TableHead>
                        <TableHead>Giờ</TableHead>
                        <TableHead>Cách tính</TableHead>
                        <TableHead className="text-right">Mức</TableHead>
                        <TableHead>TT</TableHead>
                        <TableHead>Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>
                            {formatClockTime(template.startTime)} –{" "}
                            {formatClockTime(template.endTime)}
                          </TableCell>
                          <TableCell>{labelPayMode(template.payMode)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatVnd(template.defaultAmount)}
                          </TableCell>
                          <TableCell>{template.isActive ? "Dùng" : "Ẩn"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-11"
                                disabled={pending}
                                onClick={() => {
                                  setTemplateError(null);
                                  setEditingTemplate(template);
                                }}
                              >
                                Sửa
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                className="min-h-11"
                                disabled={pending}
                                onClick={() =>
                                  run(
                                    () => deleteShiftTemplate(template.id),
                                    "Đã xóa mẫu ca",
                                    setTemplateError,
                                  )
                                }
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
            <CardTitle>Vào ca</CardTitle>
            <CardDescription>
              Chọn nhân viên và mẫu ca. Lương tháng (có chấm công) chỉ điểm danh, không tính tiền
              ca.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid max-w-xl gap-3 sm:grid-cols-2"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                const amountRaw = String(data.get("amount") ?? "").trim();
                run(
                  () =>
                    clockIn({
                      userId: String(data.get("userId") ?? ""),
                      templateId: String(data.get("templateId") ?? ""),
                      amount: amountRaw ? Number(amountRaw) : undefined,
                    }),
                  "Đã vào ca",
                  setShiftError,
                  () => {
                    form.reset();
                    setClockUserId("");
                    setClockTemplateId("");
                  },
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
                  disabled={clockable.length === 0}
                  value={clockUserId}
                  onChange={(event) => setClockUserId(event.target.value)}
                  className={selectClass}
                >
                  <option value="" disabled>
                    {clockable.length === 0 ? "Chưa có người vào ca được" : "Chọn nhân viên"}
                  </option>
                  {clockable.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName || member.name} · {labelRole(member.role)}
                      {member.payType === "MONTHLY" ? " · chấm công" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="shift-template" className="text-sm font-medium">
                  Mẫu ca <span aria-hidden="true">*</span>
                </label>
                <select
                  id="shift-template"
                  name="templateId"
                  value={clockTemplateId}
                  onChange={(event) => setClockTemplateId(event.target.value)}
                  className={selectClass}
                >
                  <option value="">
                    {activeTemplates.length === 0
                      ? "Chưa có mẫu ca — dùng lương giờ / chấm công"
                      : "Không chọn (lương giờ / chấm công)"}
                  </option>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({formatClockTime(template.startTime)}–
                      {formatClockTime(template.endTime)}) · {labelPayMode(template.payMode)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="shift-amount" className="text-sm font-medium">
                  Mức lần này (để trống = tự lấy)
                </label>
                <Input
                  id="shift-amount"
                  name="amount"
                  type="number"
                  min={0}
                  step={1000}
                  className={fieldClass}
                  placeholder={
                    previewRate
                      ? `${previewRate.label}: ${formatVnd(previewRate.amount)}`
                      : "Tự động theo mẫu ca / mức NV"
                  }
                />
              </div>
              {shiftError ? (
                <p role="alert" className="text-sm text-destructive sm:col-span-2">
                  {shiftError}
                </p>
              ) : null}
              {activeTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Nên tạo mẫu ca ở trên. Có thể vào ca tạm bằng mức lần này / lương giờ NV hoặc chấm
                  công lương tháng.
                </p>
              ) : null}
              <Button
                type="submit"
                className="min-h-11 sm:col-span-2"
                disabled={pending || clockable.length === 0}
              >
                Vào ca
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lịch sử ca</CardTitle>
            <CardDescription>
              Ra ca: theo giờ = giờ × mức; cố định = đúng mức; chấm công = 0đ.
            </CardDescription>
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
                      <TableHead>Mẫu ca</TableHead>
                      <TableHead>Vào</TableHead>
                      <TableHead>Ra</TableHead>
                      <TableHead>Kiểu</TableHead>
                      <TableHead className="text-right">Mức</TableHead>
                      <TableHead className="text-right">Thành tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((shift) => (
                      <TableRow key={shift.id}>
                        <TableCell>{shift.userName}</TableCell>
                        <TableCell>{shift.templateName ?? "—"}</TableCell>
                        <TableCell>{formatWhen(shift.startTime)}</TableCell>
                        <TableCell>{shift.endTime ? formatWhen(shift.endTime) : "—"}</TableCell>
                        <TableCell>{labelPayMode(shift.payMode)}</TableCell>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa nhân viên</DialogTitle>
            <DialogDescription>
              {editing?.role === "SERVICE_STAFF"
                ? "Nhân viên phục vụ không đăng nhập — chỉ dùng để gọi vào phòng."
                : "Đổi chế độ lương, PIN hoặc mức theo mẫu ca."}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              key={editing.id}
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const input = readStaff(new FormData(event.currentTarget), templates);
                run(
                  () => updateStaff({ id: editing.id, ...input }),
                  "Đã cập nhật nhân viên",
                  setStaffError,
                  () => setEditing(null),
                );
              }}
            >
              <StaffFields
                idPrefix="edit"
                member={editing}
                templates={templates}
                shiftRates={shiftRates}
              />
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
        open={editingTemplate !== null}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa mẫu ca</DialogTitle>
            <DialogDescription>Đổi giờ hoặc cách tính tiền mặc định.</DialogDescription>
          </DialogHeader>
          {editingTemplate ? (
            <form
              key={editingTemplate.id}
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(
                  () =>
                    updateShiftTemplate({
                      id: editingTemplate.id,
                      name: String(data.get("name") ?? ""),
                      startTime: String(data.get("startTime") ?? ""),
                      endTime: String(data.get("endTime") ?? ""),
                      payMode: String(data.get("payMode") ?? ""),
                      defaultAmount: Number(data.get("defaultAmount") ?? 0),
                      isActive:
                        data.get("isActive") === "on" || data.get("isActive") === "true",
                    }),
                  "Đã cập nhật mẫu ca",
                  setTemplateError,
                  () => setEditingTemplate(null),
                );
              }}
            >
              <TemplateFields idPrefix="tpl-edit" template={editingTemplate} />
              {templateError ? (
                <p role="alert" className="text-sm text-destructive">
                  {templateError}
                </p>
              ) : null}
              <DialogFooter className="gap-2 sm:flex-col">
                <Button type="submit" className="min-h-11 w-full" disabled={pending}>
                  Lưu
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  disabled={pending}
                  onClick={() => setEditingTemplate(null)}
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
