"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Minus, Plus } from "lucide-react";
import { logout } from "@/app/actions/auth";
import {
  adjustInvoiceItem,
  confirmPaid,
  markRoomAvailable,
  prepareCheckout,
  startRoom,
} from "@/app/actions/pos";
import { PaymentDialog } from "@/components/pos/payment-dialog";
import { StockAuditDialog } from "@/components/pos/stock-audit-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { labelCategory, productCategories, type ProductCategory } from "@/lib/catalog";
import { estimatedRoomCost, formatElapsed, formatVnd } from "@/lib/money";
import type {
  ActionResult,
  InvoiceItem,
  PaymentCheckout,
  Product,
  Room,
  StaffOption,
  StockAuditLine,
} from "@/lib/pos-types";

export type PosBill = {
  id: string;
  startTime: string;
  serviceTotal: number;
  staffTotal: number;
  items: InvoiceItem[];
  bookings: { id: string }[];
};

function notify(result: ActionResult, success: string) {
  if (result.ok) {
    toast.add({ title: success, type: "success" });
    return true;
  }
  toast.add({ title: "Không thực hiện được", description: result.error, type: "error" });
  return false;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function formatStartClock(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function Clock() {
  const now = useNow();
  const label = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return (
    <time
      dateTime={new Date(now).toISOString()}
      className="font-mono text-lg font-bold tabular-nums text-slate-950 md:text-2xl"
    >
      {label}
    </time>
  );
}

function billItemsTotal(items: InvoiceItem[]) {
  return items.reduce((sum, item) => {
    const qty =
      item.is_minibar_item || item.initial_qty > 0
        ? item.initial_qty + item.ordered_qty - item.remaining_qty
        : item.ordered_qty;
    return sum + Math.max(0, qty) * item.price;
  }, 0);
}

export function PosKiosk({
  cashierName,
  rooms,
  products,
  staff: _staff,
  bills,
}: {
  cashierName: string;
  rooms: Room[];
  products: Product[];
  staff: StaffOption[];
  bills: Record<string, PosBill>;
}) {
  void _staff;
  const router = useRouter();
  const now = useNow();
  const [pending, startTransition] = useTransition();
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [category, setCategory] = useState<ProductCategory | "ALL">("ALL");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payment, setPayment] = useState<PaymentCheckout | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const room = rooms.find((item) => item.id === openRoomId) ?? null;
  const bill = room ? bills[room.id] ?? null : null;
  const visibleProducts = products.filter(
    (product) => category === "ALL" || product.category === category,
  );

  function run(action: () => Promise<ActionResult>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!notify(result, success)) return;
      after?.();
      router.refresh();
    });
  }

  const sheetRoomCost =
    room && bill ? estimatedRoomCost(bill.startTime, room.hourly_rate, now) : 0;
  const sheetItemsCost = bill ? billItemsTotal(bill.items) : 0;
  const sheetStaffCost = bill?.staffTotal ?? 0;
  const sheetGrand = sheetRoomCost + sheetItemsCost + sheetStaffCost;

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-slate-100">
      <header className="flex min-h-14 items-center justify-between gap-2 bg-white px-3 md:min-h-16 md:gap-4 md:px-6">
        <p className="min-w-0 truncate text-base font-bold text-slate-950 md:text-lg">
          {cashierName}
        </p>
        <Clock />
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            className="min-h-12 px-3 text-base font-bold text-slate-950 md:min-h-14 md:px-4 md:text-lg"
          >
            <LogOut aria-hidden="true" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </Button>
        </form>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
        {rooms.length === 0 ? (
          <p className="text-xl text-slate-500">Chưa có phòng.</p>
        ) : (
          <section
            aria-label="Danh sách phòng"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            {rooms.map((item) => {
              const active = bills[item.id];

              if (item.status === "AVAILABLE") {
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenRoomId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpenRoomId(item.id);
                      }
                    }}
                    className="flex min-h-40 cursor-pointer flex-col justify-between rounded-2xl bg-green-500 p-3 text-white shadow-sm focus-visible:ring-3 focus-visible:ring-slate-950 focus-visible:outline-none md:min-h-48 md:p-4"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
                        Phòng trống
                      </p>
                      <p className="mt-1 text-xl font-bold tracking-tight md:text-2xl">
                        {item.name}
                      </p>
                      <p className="mt-1 font-mono text-sm font-bold tabular-nums md:text-base">
                        {formatVnd(item.hourly_rate)}/giờ
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={pending}
                      className="mt-3 h-12 w-full bg-white text-base font-bold text-green-700 hover:bg-green-50 md:h-14 md:text-lg"
                      onClick={(event) => {
                        event.stopPropagation();
                        run(() => startRoom(item.id), `Đã mở ${item.name}`);
                      }}
                    >
                      MỞ PHÒNG
                    </Button>
                  </div>
                );
              }

              if (item.status === "IN_USE" && active) {
                const tienHat = estimatedRoomCost(active.startTime, item.hourly_rate, now);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenRoomId(item.id)}
                    className="flex min-h-40 cursor-pointer flex-col gap-1 rounded-2xl bg-red-600 p-3 text-left text-white shadow-sm focus-visible:ring-3 focus-visible:ring-slate-950 focus-visible:outline-none md:min-h-48 md:gap-1.5 md:p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
                      Đang hát
                    </p>
                    <p className="text-xl font-bold tracking-tight md:text-2xl">{item.name}</p>
                    <p className="text-sm md:text-base">
                      Bắt đầu:{" "}
                      <span className="font-mono font-bold tabular-nums">
                        {formatStartClock(active.startTime)}
                      </span>
                    </p>
                    <p className="text-sm md:text-base">
                      Giờ hát:{" "}
                      <span className="font-mono text-xl font-bold tabular-nums md:text-3xl">
                        {formatElapsed(active.startTime, now)}
                      </span>
                    </p>
                    <p className="mt-auto text-sm md:text-base">
                      Tổng tiền:{" "}
                      <span className="font-mono text-xl font-bold tabular-nums md:text-3xl">
                        {formatVnd(tienHat)}
                      </span>
                    </p>
                    <p className="text-xs opacity-80">Tiền hát · {formatVnd(item.hourly_rate)}/giờ</p>
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOpenRoomId(item.id)}
                  className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-amber-400 p-3 text-center text-amber-950 focus-visible:ring-3 focus-visible:ring-slate-950 focus-visible:outline-none md:min-h-48 md:p-4"
                >
                  <p className="text-xl font-bold md:text-2xl">{item.name}</p>
                  <p className="text-base font-bold md:text-xl">Đang dọn</p>
                </button>
              );
            })}
          </section>
        )}
      </main>

      <Sheet open={room !== null} onOpenChange={(open) => !open && setOpenRoomId(null)}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden border-l border-slate-200 p-0 shadow-none sm:max-w-md md:max-w-lg lg:max-w-xl"
        >
          {room ? (
            <div className="flex h-full min-h-0 flex-col bg-white">
              <SheetHeader className="border-b border-slate-100 pr-14">
                <SheetTitle className="text-2xl font-bold text-slate-950 md:text-3xl">
                  {room.name}
                </SheetTitle>
                <SheetDescription className="text-sm text-slate-500 md:text-base">
                  {room.type} · {formatVnd(room.hourly_rate)}/giờ
                </SheetDescription>
              </SheetHeader>

              {room.status === "AVAILABLE" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <p className="text-lg text-slate-600">Phòng trống</p>
                  <Button
                    type="button"
                    className="h-16 w-full max-w-sm bg-green-600 text-2xl font-bold hover:bg-green-700"
                    disabled={pending}
                    onClick={() => run(() => startRoom(room.id), `Đã mở ${room.name}`)}
                  >
                    MỞ PHÒNG
                  </Button>
                </div>
              ) : null}

              {room.status === "CLEANING" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <p className="text-lg text-slate-600">Đang dọn</p>
                  <Button
                    type="button"
                    className="h-16 w-full max-w-sm text-xl font-bold"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => markRoomAvailable(room.id),
                        `${room.name} đã trống`,
                        () => setOpenRoomId(null),
                      )
                    }
                  >
                    Đã dọn xong
                  </Button>
                </div>
              ) : null}

              {room.status === "IN_USE" && bill ? (
                <Tabs defaultValue="bill" className="min-h-0 flex-1 gap-0">
                  <TabsList className="h-auto w-full rounded-none bg-slate-50 p-2">
                    <TabsTrigger value="bill" className="min-h-14 flex-1 text-lg font-bold">
                      Đồ đã gọi
                    </TabsTrigger>
                    <TabsTrigger value="menu" className="min-h-14 flex-1 text-lg font-bold">
                      Thực đơn
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="bill" className="min-h-0 overflow-y-auto p-4">
                    <div className="mb-4 rounded-xl bg-slate-950 p-4 text-white">
                      <p className="text-sm opacity-80">
                        Bắt đầu lúc {formatStartClock(bill.startTime)}
                      </p>
                      <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                        Giờ hát {formatElapsed(bill.startTime, now)}
                      </p>
                      <p className="mt-2 text-sm opacity-80">Tiền hát</p>
                      <p className="font-mono text-2xl font-bold tabular-nums">
                        {formatVnd(sheetRoomCost)}
                      </p>
                    </div>

                    <BillList
                      items={bill.items}
                      pending={pending}
                      onAdjust={(productId, delta) =>
                        run(
                          () => adjustInvoiceItem(bill.id, productId, delta),
                          delta > 0 ? "Đã thêm 1" : "Đã bớt 1",
                        )
                      }
                    />

                    <div className="mt-6 space-y-2 border-t border-slate-200 pt-4">
                      <div className="flex justify-between text-base text-slate-600">
                        <span>Tiền hát</span>
                        <span className="font-mono font-bold tabular-nums text-slate-950">
                          {formatVnd(sheetRoomCost)}
                        </span>
                      </div>
                      <div className="flex justify-between text-base text-slate-600">
                        <span>Đồ đã gọi</span>
                        <span className="font-mono font-bold tabular-nums text-slate-950">
                          {formatVnd(sheetItemsCost)}
                        </span>
                      </div>
                      {sheetStaffCost > 0 ? (
                        <div className="flex justify-between text-base text-slate-600">
                          <span>Phục vụ</span>
                          <span className="font-mono font-bold tabular-nums text-slate-950">
                            {formatVnd(sheetStaffCost)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex justify-between text-2xl font-bold text-slate-950">
                        <span>Tổng tiền</span>
                        <span className="font-mono tabular-nums">{formatVnd(sheetGrand)}</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      className="mt-4 h-16 w-full bg-red-600 text-2xl font-bold hover:bg-red-700"
                      disabled={pending}
                      onClick={() => setCheckoutOpen(true)}
                    >
                      Thanh toán
                    </Button>

                    <StockAuditDialog
                      open={checkoutOpen}
                      onOpenChange={setCheckoutOpen}
                      pending={pending}
                      roomName={room.name}
                      startTime={bill.startTime}
                      hourlyRate={room.hourly_rate}
                      items={bill.items}
                      staffTotal={sheetStaffCost}
                      onConfirm={(audit: StockAuditLine[]) => {
                        startTransition(async () => {
                          const result = await prepareCheckout(bill.id, audit);
                          if (!result.ok) {
                            toast.add({
                              title: "Không thực hiện được",
                              description: result.error,
                              type: "error",
                            });
                            return;
                          }
                          setCheckoutOpen(false);
                          setPayment({
                            invoiceId: result.invoiceId,
                            roomName: result.roomName,
                            grandTotal: result.grandTotal,
                            bankBin: result.bankBin,
                            bankAccountNumber: result.bankAccountNumber,
                            bankAccountName: result.bankAccountName,
                          });
                          setPaymentOpen(true);
                          router.refresh();
                        });
                      }}
                    />
                    <PaymentDialog
                      open={paymentOpen}
                      onOpenChange={setPaymentOpen}
                      pending={pending}
                      payment={payment}
                      onConfirmPaid={() => {
                        if (!payment) return;
                        run(
                          () => confirmPaid(payment.invoiceId),
                          "Đã thu tiền",
                          () => {
                            setPaymentOpen(false);
                            setPayment(null);
                            setOpenRoomId(null);
                          },
                        );
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="menu" className="min-h-0 overflow-y-auto p-4">
                    <p className="mb-3 text-base font-semibold text-slate-700">Thêm món</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={category === "ALL" ? "default" : "outline"}
                        className="min-h-14 px-4 text-lg font-bold"
                        onClick={() => setCategory("ALL")}
                      >
                        Tất cả
                      </Button>
                      {productCategories.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          variant={category === item ? "default" : "outline"}
                          className="min-h-14 px-4 text-lg font-bold"
                          onClick={() => setCategory(item)}
                        >
                          {labelCategory(item)}
                        </Button>
                      ))}
                    </div>
                    {visibleProducts.length === 0 ? (
                      <p className="text-base text-slate-500">Chưa có món trong thực đơn.</p>
                    ) : (
                      <ul className="grid grid-cols-2 gap-3">
                        {visibleProducts.map((product) => (
                          <li key={product.id}>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(
                                  () => adjustInvoiceItem(bill.id, product.id, 1),
                                  `Đã thêm ${product.name}`,
                                )
                              }
                              className="flex min-h-28 w-full cursor-pointer flex-col items-start justify-between rounded-2xl bg-slate-900 p-4 text-left text-white focus-visible:ring-3 focus-visible:ring-slate-950 focus-visible:outline-none disabled:opacity-50 md:min-h-32"
                            >
                              <span className="text-base font-bold md:text-lg">{product.name}</span>
                              <span className="font-mono text-lg font-bold tabular-nums md:text-xl">
                                {formatVnd(product.selling_price)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                </Tabs>
              ) : null}

              {room.status === "IN_USE" && !bill ? (
                <p className="p-6 text-lg text-slate-600">
                  Phòng đang hát nhưng không có hóa đơn mở.
                </p>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BillList({
  items,
  pending,
  onAdjust,
}: {
  items: InvoiceItem[];
  pending: boolean;
  onAdjust: (productId: string, delta: number) => void;
}) {
  const lines = useMemo(
    () =>
      items.filter(
        (item) =>
          item.ordered_qty > 0 || item.is_minibar_item || item.initial_qty > 0,
      ),
    [items],
  );

  if (lines.length === 0) {
    return <p className="text-base text-slate-400">Chưa có đồ đã gọi.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {lines.map((item) => {
        const displayQty =
          item.is_minibar_item || item.initial_qty > 0
            ? item.initial_qty + item.ordered_qty
            : item.ordered_qty;
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-slate-950">{item.name}</p>
              <p className="font-mono text-base tabular-nums text-slate-500">
                {formatVnd(item.price)}
                {item.initial_qty > 0 ? ` · sẵn ${item.initial_qty}` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Bớt ${item.name}`}
              disabled={pending || item.ordered_qty <= 0}
              onClick={() => onAdjust(item.product_id, -1)}
              className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-slate-900 text-slate-950 disabled:opacity-30"
            >
              <Minus aria-hidden="true" className="size-6" strokeWidth={3} />
            </button>
            <span className="w-10 text-center font-mono text-2xl font-bold tabular-nums text-slate-950">
              {displayQty}
            </span>
            <button
              type="button"
              aria-label={`Thêm ${item.name}`}
              disabled={pending}
              onClick={() => onAdjust(item.product_id, 1)}
              className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-30"
            >
              <Plus aria-hidden="true" className="size-6" strokeWidth={3} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
