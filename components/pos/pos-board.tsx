"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addInvoiceItem,
  assignStaffBooking,
  markRoomAvailable,
  processCheckout,
  removeStaffBooking,
  startRoom,
} from "@/app/actions/pos";
import { StockAuditDialog } from "@/components/pos/stock-audit-dialog";
import { labelCategory } from "@/lib/catalog";
import { shopBookingProfit, staffCustomerCharge, staffPayout } from "@/lib/billing";
import { selectClass } from "@/lib/field-class";
import { formatVnd } from "@/lib/money";
import type {
  ActionResult,
  Invoice,
  InvoiceItem,
  Product,
  Room,
  RoomStatus,
  StaffBooking,
  StaffOption,
  StockAuditLine,
} from "@/lib/pos-types";
import { ElapsedClock } from "@/components/pos/elapsed-clock";

const statusLabel: Record<RoomStatus, string> = {
  AVAILABLE: "Available",
  IN_USE: "In use",
  CLEANING: "Cleaning",
};

const statusClass: Record<RoomStatus, string> = {
  AVAILABLE: "bg-status-available text-status-available-foreground",
  IN_USE: "bg-status-in-use text-status-in-use-foreground",
  CLEANING: "bg-status-cleaning text-status-cleaning-foreground",
};

function notify(result: ActionResult, success: string) {
  if (result.ok) {
    toast.add({ title: success, type: "success" });
    return true;
  }
  toast.add({ title: "Không thực hiện được", description: result.error, type: "error" });
  return false;
}

export function PosBoard({
  rooms,
  products,
  staff,
  selectedRoomId,
  invoice,
  items,
  bookings,
  loadError,
  fetchedAt,
}: {
  rooms: Room[];
  products: Product[];
  staff: StaffOption[];
  selectedRoomId: string | null;
  invoice: Invoice | null;
  items: InvoiceItem[];
  bookings: StaffBooking[];
  loadError: string | null;
  fetchedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const selected = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const productTotal = items.reduce((sum, item) => sum + item.consumed_qty * item.price, 0);
  const staffTotal = bookings.reduce(
    (sum, booking) => sum + staffCustomerCharge(booking.hours_worked, booking.customer_rate),
    0,
  );

  function run(action: () => Promise<ActionResult>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (notify(result, success)) after?.();
    });
  }

  function confirmCheckout(audit: StockAuditLine[]) {
    if (!invoice) return;
    run(
      () => processCheckout(invoice.id, audit),
      "Đã chốt hóa đơn",
      () => setCheckoutOpen(false),
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Không đọc được dữ liệu</CardTitle>
          <CardDescription>
            Dán <span className="font-mono">supabase_schema.sql</span> rồi{" "}
            <span className="font-mono">update_schema.sql</span> vào SQL Editor của Supabase, rồi tải lại trang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">POS</h1>
          <p className="text-sm text-muted-foreground">
            {rooms.filter((room) => room.status === "IN_USE").length} phòng đang dùng
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Cập nhật lúc{" "}
          <time dateTime={fetchedAt}>
            {new Intl.DateTimeFormat("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(fetchedAt))}
          </time>
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <section aria-label="Danh sách phòng" className="grid gap-3 sm:grid-cols-2">
          {rooms.length === 0 ? (
            <Card className="sm:col-span-2">
              <CardHeader>
                <CardTitle>Chưa có phòng</CardTitle>
                <CardDescription>
                  Thêm phòng vào bảng rooms trên Supabase để bắt đầu ca.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            rooms.map((room) => {
              const isSelected = room.id === selectedRoomId;
              return (
                <Card
                  key={room.id}
                  className={isSelected ? "ring-2 ring-ring" : undefined}
                >
                  <CardHeader>
                    <CardTitle>{room.name}</CardTitle>
                    <CardDescription>
                      {room.type} · {formatVnd(room.hourly_rate)}/giờ
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <span
                      className={`inline-flex min-h-6 items-center rounded-full px-2 text-xs font-medium ${statusClass[room.status]}`}
                    >
                      {statusLabel[room.status]}
                    </span>
                  </CardContent>
                  <CardFooter>
                    {room.status === "AVAILABLE" ? (
                      <Button
                        type="button"
                        className="min-h-11 w-full"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => startRoom(room.id),
                            `Đã mở ${room.name}`,
                            () => router.push(`/pos?room=${room.id}`),
                          )
                        }
                      >
                        Start Room
                      </Button>
                    ) : null}
                    {room.status === "IN_USE" ? (
                      <Button
                        type="button"
                        variant={isSelected ? "secondary" : "default"}
                        className="min-h-11 w-full"
                        onClick={() => router.push(`/pos?room=${room.id}`)}
                      >
                        Open Bill
                      </Button>
                    ) : null}
                    {room.status === "CLEANING" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => markRoomAvailable(room.id),
                            `${room.name} đã sẵn sàng`,
                          )
                        }
                      >
                        Mark available
                      </Button>
                    ) : null}
                  </CardFooter>
                </Card>
              );
            })
          )}
        </section>

        <section aria-label="Hóa đơn" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {selected ? selected.name : "Chưa chọn phòng"}
              </CardTitle>
              <CardDescription>
                {selected?.status === "IN_USE"
                  ? "Hóa đơn đang mở"
                  : "Chọn phòng In use rồi bấm Open Bill."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {selected?.status === "IN_USE" && invoice ? (
                <>
                  <p className="text-sm">
                    Bắt đầu{" "}
                    <time dateTime={invoice.start_time} className="font-medium">
                      {new Intl.DateTimeFormat("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      }).format(new Date(invoice.start_time))}
                    </time>
                  </p>
                  <ElapsedClock
                    startTime={invoice.start_time}
                    hourlyRate={selected.hourly_rate}
                  />
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Chưa có món. Minibar được nạp khi mở phòng nếu phòng đã được gán sẵn.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Món</TableHead>
                          <TableHead className="text-right">Có sẵn</TableHead>
                          <TableHead className="text-right">Gọi thêm</TableHead>
                          <TableHead className="text-right">Tạm tính</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {item.name}
                              {item.is_minibar_item ? (
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  Minibar · kiểm lúc chốt
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {item.initial_qty}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {item.ordered_qty}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {item.is_minibar_item ? "Khi kiểm kho" : formatVnd(item.consumed_qty * item.price)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <dl className="grid gap-1 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Món đã tính</dt>
                      <dd className="font-mono tabular-nums">{formatVnd(productTotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Nhân viên phục vụ</dt>
                      <dd className="font-mono tabular-nums">{formatVnd(staffTotal)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selected?.status === "IN_USE"
                    ? "Phòng đang dùng nhưng không có hóa đơn ACTIVE."
                    : "Hóa đơn chỉ hiện khi phòng đang In use."}
                </p>
              )}
            </CardContent>
            {selected?.status === "IN_USE" && invoice ? (
              <CardFooter>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => setCheckoutOpen(true)}
                >
                  Checkout
                </Button>
                <StockAuditDialog
                  open={checkoutOpen}
                  onOpenChange={setCheckoutOpen}
                  pending={pending}
                  roomName={selected.name}
                  startTime={invoice.start_time}
                  hourlyRate={selected.hourly_rate}
                  items={items}
                  staffTotal={staffTotal}
                  onConfirm={confirmCheckout}
                />
              </CardFooter>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service Staff</CardTitle>
              <CardDescription>
                Giá tính theo giờ. Khách trả = số giờ × giá khách. Lợi nhuận quán = số giờ × (giá khách − trả nhân viên).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form
                className="grid gap-3 sm:grid-cols-2"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!invoice) return;
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  setBookingError(null);
                  startTransition(async () => {
                    const result = await assignStaffBooking({
                      invoiceId: invoice.id,
                      staffId: String(data.get("staffId") ?? ""),
                      hoursWorked: Number(data.get("hoursWorked")),
                      customerRate: Number(data.get("customerRate")),
                      staffPayoutRate: Number(data.get("staffPayoutRate")),
                    });
                    if (!notify(result, "Đã gán nhân viên")) {
                      setBookingError(result.ok ? null : result.error);
                      return;
                    }
                    form.reset();
                    router.refresh();
                  });
                }}
              >
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label htmlFor="booking-staff" className="text-sm font-medium">
                    Nhân viên <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="booking-staff"
                    name="staffId"
                    required
                    defaultValue=""
                    disabled={pending || !invoice || staff.length === 0}
                    className={selectClass}
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
                  <label htmlFor="booking-hours" className="text-sm font-medium">
                    Số giờ <span aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="booking-hours"
                    name="hoursWorked"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    className="min-h-11"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="booking-customer" className="text-sm font-medium">
                    Giá khách / giờ <span aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="booking-customer"
                    name="customerRate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    required
                    className="min-h-11"
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label htmlFor="booking-payout" className="text-sm font-medium">
                    Trả nhân viên / giờ <span aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="booking-payout"
                    name="staffPayoutRate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    required
                    className="min-h-11"
                  />
                </div>
                {bookingError ? (
                  <p role="alert" className="text-sm text-destructive sm:col-span-2">
                    {bookingError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  className="min-h-11 sm:col-span-2"
                  disabled={pending || !invoice || staff.length === 0}
                >
                  Gán vào phòng
                </Button>
              </form>
              {bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa gán nhân viên cho hóa đơn này.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nhân viên</TableHead>
                      <TableHead className="text-right">Giờ</TableHead>
                      <TableHead className="text-right">Khách trả</TableHead>
                      <TableHead className="text-right">Trả NV</TableHead>
                      <TableHead className="text-right">Quán lãi</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell>{booking.staff_name}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {booking.hours_worked}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatVnd(staffCustomerCharge(booking.hours_worked, booking.customer_rate))}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatVnd(staffPayout(booking.hours_worked, booking.staff_payout_rate))}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatVnd(shopBookingProfit(booking.hours_worked, booking.profit))}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={pending}
                            onClick={() =>
                              run(() => removeStaffBooking(booking.id), "Đã gỡ nhân viên")
                            }
                          >
                            Gỡ
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Thực đơn</CardTitle>
              <CardDescription>
                Bấm món để thêm một suất vào hóa đơn đang mở. Món minibar được kiểm số còn lại lúc chốt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Chưa có món trong bảng products.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {products.map((product) => (
                    <li key={product.id}>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 h-auto w-full justify-between whitespace-normal py-2 text-left"
                        disabled={pending || !invoice}
                        onClick={() =>
                          invoice &&
                          run(
                            () => addInvoiceItem(invoice.id, product.id),
                            `Đã thêm ${product.name}`,
                          )
                        }
                      >
                        <span>
                          {product.name}
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {labelCategory(product.category)}
                            {product.is_minibar_item ? " · Minibar" : ""}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums">
                          {formatVnd(product.selling_price)}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
