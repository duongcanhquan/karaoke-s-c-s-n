"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { LogOut, Minus, Plus } from "lucide-react";
import { logout } from "@/app/actions/auth";
import {
  adjustInvoiceItem,
  confirmPaid,
  markRoomAvailable,
  prepareCheckout,
  recomputeCheckout,
  startRoom,
} from "@/app/actions/pos";
import { ManagerPinDialog } from "@/components/pos/manager-pin-dialog";
import { PaymentDialog } from "@/components/pos/payment-dialog";
import { RevenueBoard } from "@/components/pos/revenue-board";
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
import { billableHours, formatElapsed, formatVnd } from "@/lib/money";
import type {
  ActionResult,
  InvoiceItem,
  PaymentCheckout,
  Product,
  Room,
  RoomSetupItem,
  StaffOption,
  StockAuditLine,
} from "@/lib/pos-types";
import {
  formatVietnamHeaderDate,
  formatVietnamHeaderTime,
} from "@/lib/vietnam-time";

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

/** Local clock only — never talks to Supabase. Use a longer interval on the room grid. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
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

function HeaderClock() {
  const now = useNow(1000);
  return (
    <time dateTime={new Date(now).toISOString()} className="text-center leading-tight">
      <span className="block text-sm font-semibold text-slate-800 md:text-base">
        {formatVietnamHeaderDate(new Date(now))}
      </span>
      <span className="block font-mono text-xl font-bold tabular-nums text-slate-950 md:text-3xl">
        {formatVietnamHeaderTime(new Date(now))}
      </span>
    </time>
  );
}

export function PosKiosk({
  cashierName,
  rooms: roomsProp,
  products,
  staff: _staff,
  bills: billsProp,
  roomSetups,
}: {
  cashierName: string;
  rooms: Room[];
  products: Product[];
  staff: StaffOption[];
  bills: Record<string, PosBill>;
  roomSetups: Record<string, RoomSetupItem[]>;
}) {
  void _staff;
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState(roomsProp);
  const [bills, setBills] = useState(billsProp);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [category, setCategory] = useState<ProductCategory | "ALL">("ALL");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [payment, setPayment] = useState<PaymentCheckout | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [revenueOpen, setRevenueOpen] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);
  /** Room kept for checkout/payment after sheet closes (nested modal freeze fix). */
  const [payRoomId, setPayRoomId] = useState<string | null>(null);
  const [pendingReduce, setPendingReduce] = useState<{
    invoiceId: string;
    productId: string;
    refreshPayment?: boolean;
  } | null>(null);

  useEffect(() => {
    setRooms(roomsProp);
  }, [roomsProp]);
  useEffect(() => {
    setBills(billsProp);
  }, [billsProp]);

  const room = rooms.find((item) => item.id === openRoomId) ?? null;
  const bill = room ? bills[room.id] ?? null : null;
  const payRoom =
    rooms.find((item) => item.id === (payRoomId ?? openRoomId)) ?? null;
  const payBill = payRoom ? bills[payRoom.id] ?? null : null;
  // 1s only while an active room sheet is open; grid uses 15s — still 100% local, zero Supabase.
  const now = useNow(room?.status === "IN_USE" && bill ? 1000 : 15_000);
  const setupItems = room ? roomSetups[room.id] ?? [] : [];
  const locked = pending || busy || checkoutBusy;

  useEffect(() => {
    setSetupChecked(false);
  }, [openRoomId]);
  const visibleProducts = products.filter(
    (product) => category === "ALL" || product.category === category,
  );
  const orderedCount = bill
    ? bill.items.reduce((sum, item) => sum + Math.max(0, item.ordered_qty), 0)
    : 0;

  function applyLocalDelta(
    roomId: string,
    productId: string,
    delta: 1 | -1,
    productMeta?: Product,
  ) {
    setBills((current) => {
      const bill = current[roomId];
      if (!bill) return current;
      const items = [...bill.items];
      const index = items.findIndex((item) => item.product_id === productId);
      if (index < 0) {
        if (delta < 0 || !productMeta) return current;
        items.push({
          id: `local-${bill.id}-${productId}`,
          product_id: productId,
          name: productMeta.name,
          is_minibar_item: productMeta.is_minibar_item,
          initial_qty: 0,
          ordered_qty: 1,
          remaining_qty: productMeta.is_minibar_item ? 1 : 0,
          consumed_qty: 0,
          price: productMeta.selling_price,
        });
      } else {
        const item = items[index];
        const ordered = item.ordered_qty + delta;
        if (ordered < 0) return current;
        if (ordered === 0 && item.initial_qty === 0) {
          items.splice(index, 1);
        } else {
          const available = item.initial_qty + ordered;
          const remaining = item.is_minibar_item
            ? Math.min(available, Math.max(0, item.remaining_qty + delta))
            : 0;
          items[index] = { ...item, ordered_qty: ordered, remaining_qty: remaining };
        }
      }
      return { ...current, [roomId]: { ...bill, items } };
    });
  }

  function runAdd(productId: string, success: string, productMeta?: Product) {
    if (!room || !bill) return;
    const roomId = room.id;
    const invoiceId = bill.id;
    const meta =
      productMeta ?? products.find((product) => product.id === productId);
    applyLocalDelta(roomId, productId, 1, meta);
    startTransition(async () => {
      const result = await adjustInvoiceItem(invoiceId, productId, 1);
      if (!result.ok) {
        applyLocalDelta(roomId, productId, -1);
        notify(result, success);
        return;
      }
      toast.add({ title: success, type: "success" });
    });
  }

  async function openRoomNow(roomId: string, roomName: string) {
    setBusy(true);
    try {
      const result = await startRoom(roomId);
      if (!result.ok) {
        notify(result, roomName);
        return;
      }
      // Apply room + bill together so the sheet never flashes an empty IN_USE state.
      setRooms((current) =>
        current.map((item) =>
          item.id === roomId ? { ...item, status: "IN_USE" as const } : item,
        ),
      );
      setBills((current) => ({
        ...current,
        [roomId]: {
          id: result.invoiceId,
          startTime: result.startTime,
          serviceTotal: 0,
          staffTotal: 0,
          items: result.items.map((item) => ({
            id: item.id,
            product_id: item.productId,
            name: item.name,
            is_minibar_item: item.isMinibar,
            initial_qty: item.initialQty,
            ordered_qty: item.orderedQty,
            remaining_qty: item.remainingQty,
            consumed_qty: 0,
            price: item.price,
          })),
          bookings: [],
        },
      }));
      setSetupChecked(false);
      toast.add({ title: `Đã mở ${roomName}`, type: "success" });
    } finally {
      setBusy(false);
    }
  }

  async function closeCleaningNow(roomId: string, roomName: string) {
    setRooms((current) =>
      current.map((item) =>
        item.id === roomId ? { ...item, status: "AVAILABLE" as const } : item,
      ),
    );
    setOpenRoomId(null);
    setBusy(true);
    try {
      const result = await markRoomAvailable(roomId);
      if (!result.ok) {
        setRooms((current) =>
          current.map((item) =>
            item.id === roomId ? { ...item, status: "CLEANING" as const } : item,
          ),
        );
        notify(result, `${roomName} đã trống`);
        return;
      }
      toast.add({ title: `${roomName} đã trống`, type: "success" });
    } finally {
      setBusy(false);
    }
  }

  function requestReduce(invoiceId: string, productId: string, refreshPayment = false) {
    setPendingReduce({ invoiceId, productId, refreshPayment });
    setPinOpen(true);
  }

  function refreshPaymentCheckout(invoiceId: string) {
    void (async () => {
      setCheckoutBusy(true);
      try {
        const result = await recomputeCheckout(invoiceId);
        if (!result.ok) {
          toast.add({
            title: "Không tính lại được",
            description: result.error,
            type: "error",
          });
          return;
        }
        const { ok: _ok, ...checkout } = result;
        void _ok;
        setPayment(checkout);
      } finally {
        setCheckoutBusy(false);
      }
    })();
  }

  function openCheckout() {
    if (!room || !bill) return;
    // Close sheet first — Base UI Sheet+Dialog nesting freezes pointer events.
    setPayRoomId(room.id);
    setOpenRoomId(null);
    setCheckoutOpen(true);
  }

  async function runPrepareCheckout(audit: StockAuditLine[]) {
    if (!payBill) return;
    setCheckoutBusy(true);
    try {
      const result = await prepareCheckout(payBill.id, audit);
      if (!result.ok) {
        toast.add({
          title: "Không tính được tiền",
          description: result.error,
          type: "error",
        });
        return;
      }
      const { ok: _ok, ...checkout } = result;
      void _ok;
      setCheckoutOpen(false);
      setPayment(checkout);
      setPaymentOpen(true);
    } catch (error) {
      toast.add({
        title: "Không tính được tiền",
        description: error instanceof Error ? error.message : "Lỗi không xác định",
        type: "error",
      });
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-slate-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 size-[22rem] rounded-full bg-teal-500/25 blur-2xl" />
        <div className="absolute -right-16 top-24 size-[20rem] rounded-full bg-rose-500/20 blur-2xl" />
      </div>

      <header className="relative z-10 flex min-h-16 items-center justify-between gap-3 border-b border-white/30 bg-white/90 px-4 md:min-h-20 md:px-8">
        <p className="min-w-0 truncate text-lg font-bold text-slate-950 md:text-2xl">
          {cashierName}
        </p>
        <HeaderClock />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="min-h-14 border border-slate-200 bg-white px-3 text-base font-bold text-slate-950 hover:bg-slate-50 md:min-h-16 md:px-5 md:text-xl"
            onClick={() => setRevenueOpen(true)}
          >
            Doanh thu
          </Button>
          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              className="min-h-14 px-3 text-base font-bold text-slate-950 hover:bg-white/30 md:min-h-16 md:px-5 md:text-xl"
            >
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
        {rooms.length === 0 ? (
          <p className="text-2xl text-white/80">Chưa có phòng.</p>
        ) : (
          <section
            aria-label="Bảng trạng thái phòng"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
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
                    className="flex min-h-52 cursor-pointer flex-col justify-between rounded-3xl border border-emerald-600 bg-emerald-600 p-5 text-white shadow-md focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none md:min-h-64 md:p-7"
                  >
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide opacity-90 md:text-base">
                        Phòng trống
                      </p>
                      <p className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                        {item.name}
                      </p>
                      <p className="mt-3 text-base opacity-90 md:text-lg">
                        {item.type} · {formatVnd(item.hourly_rate)}/giờ
                      </p>
                      <p className="mt-2 text-sm font-semibold opacity-95 md:text-base">
                        Setup: {(roomSetups[item.id] ?? []).length} món
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={locked}
                      className="mt-6 h-14 w-full bg-white/90 text-lg font-bold text-emerald-800 hover:bg-white md:h-16 md:text-xl"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenRoomId(item.id);
                      }}
                    >
                      KIỂM TRA & MỞ
                    </Button>
                  </div>
                );
              }

              if (item.status === "IN_USE" && active) {
                const hours = billableHours(active.startTime, now);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenRoomId(item.id)}
                    className="flex min-h-52 cursor-pointer flex-col gap-2 rounded-3xl border border-rose-700 bg-rose-600 p-5 text-left text-white shadow-md focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none md:min-h-64 md:gap-3 md:p-7"
                  >
                    <p className="text-sm font-semibold uppercase tracking-wide opacity-90 md:text-base">
                      Đang hát
                    </p>
                    <p className="text-3xl font-bold tracking-tight md:text-4xl">{item.name}</p>
                    <p className="text-base md:text-lg">
                      Bắt đầu{" "}
                      <span className="font-mono font-bold tabular-nums">
                        {formatStartClock(active.startTime)}
                      </span>
                    </p>
                    <p className="mt-auto font-mono text-4xl font-bold tabular-nums md:text-5xl">
                      {formatElapsed(active.startTime, now)}
                    </p>
                    <p className="text-base font-semibold md:text-lg">
                      Giờ tính: {hours} giờ · {formatVnd(item.hourly_rate)}/giờ
                    </p>
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOpenRoomId(item.id)}
                  className="flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-amber-500 bg-amber-400 p-5 text-center text-amber-950 shadow-md focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none md:min-h-64 md:p-7"
                >
                  <p className="text-3xl font-bold md:text-4xl">{item.name}</p>
                  <p className="text-xl font-bold md:text-2xl">Đang dọn</p>
                </button>
              );
            })}
          </section>
        )}
      </main>

      <Sheet open={room !== null} onOpenChange={(open) => !open && setOpenRoomId(null)}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden border-l border-slate-200 bg-white p-0 shadow-none sm:max-w-md md:max-w-lg lg:max-w-xl"
        >
          {room ? (
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className="border-b border-slate-200/70 pr-14">
                <SheetTitle className="text-2xl font-bold text-slate-950 md:text-3xl">
                  {room.name}
                </SheetTitle>
                <SheetDescription className="text-sm text-slate-600 md:text-base">
                  {room.type} · {formatVnd(room.hourly_rate)}/giờ
                </SheetDescription>
              </SheetHeader>

              {room.status === "AVAILABLE" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                  <div>
                    <p className="text-lg font-bold text-slate-950">Kiểm tra setup phòng</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Đối chiếu đồ trong phòng với danh sách dưới đây trước khi mở.
                    </p>
                  </div>

                  {setupItems.length === 0 ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-950">
                      Phòng chưa gán tủ minibar. Vào Quản trị → Tủ minibar để cấu hình, hoặc mở phòng
                      không kèm đồ sẵn.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {setupItems.map((item) => (
                        <li
                          key={item.productId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <span className="text-base font-semibold text-slate-950">
                            {item.productName}
                          </span>
                          <span className="font-mono text-xl font-bold tabular-nums text-slate-950">
                            × {item.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-slate-300 p-4 text-base font-medium text-slate-900">
                    <input
                      type="checkbox"
                      checked={setupChecked}
                      onChange={(event) => setSetupChecked(event.target.checked)}
                      className="mt-1 size-5 shrink-0 cursor-pointer accent-current"
                    />
                    <span>
                      Đã kiểm tra đủ đồ trong phòng
                      {setupItems.length > 0
                        ? ` (${setupItems.length} món setup)`
                        : " (không có minibar)"}
                      .
                    </span>
                  </label>

                  <Button
                    type="button"
                    className="mt-auto h-16 w-full bg-emerald-600 text-2xl font-bold hover:bg-emerald-700 disabled:opacity-40"
                    disabled={locked || !setupChecked}
                    onClick={() => void openRoomNow(room.id, room.name)}
                  >
                    {busy ? "Đang mở…" : "MỞ PHÒNG"}
                  </Button>
                </div>
              ) : null}

              {room.status === "CLEANING" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                  <p className="text-lg text-slate-600">Đang dọn</p>
                  <Button
                    type="button"
                    className="h-16 w-full max-w-sm text-xl font-bold"
                    disabled={locked}
                    onClick={() => void closeCleaningNow(room.id, room.name)}
                  >
                    {busy ? "Đang cập nhật…" : "Đã dọn xong"}
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
                    <div className="mb-4 rounded-2xl bg-rose-600 p-5 text-white">
                      <p className="text-sm opacity-90">
                        Bắt đầu lúc {formatStartClock(bill.startTime)}
                      </p>
                      <p className="mt-2 font-mono text-4xl font-bold tabular-nums">
                        {formatElapsed(bill.startTime, now)}
                      </p>
                      <p className="mt-3 text-lg font-semibold">
                        Giờ tính: {billableHours(bill.startTime, now)} giờ
                      </p>
                      <p className="mt-1 text-sm opacity-90">
                        Tiền chỉ tính khi bấm Thanh toán
                      </p>
                    </div>

                    <p className="mb-3 text-base text-slate-600">
                      Đã gọi thêm:{" "}
                      <span className="font-mono font-bold text-slate-950">{orderedCount}</span> món
                    </p>

                    <BillList
                      items={bill.items}
                      pending={locked}
                      onAdd={(productId) => runAdd(productId, "Đã thêm 1")}
                      onReduce={(productId) => requestReduce(bill.id, productId)}
                    />

                    <Button
                      type="button"
                      className="mt-6 h-16 w-full bg-rose-600 text-2xl font-bold hover:bg-rose-700"
                      disabled={locked}
                      onClick={openCheckout}
                    >
                      Thanh toán
                    </Button>
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
                              disabled={locked}
                              onClick={() =>
                                runAdd(product.id, `Đã thêm ${product.name}`, product)
                              }
                              className="flex min-h-28 w-full cursor-pointer flex-col items-start justify-between rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left text-white focus-visible:ring-3 focus-visible:ring-slate-950 focus-visible:outline-none disabled:opacity-50 md:min-h-32"
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

      {/* Dialogs MUST sit outside Sheet — nested Base UI modals freeze clicks. */}
      <StockAuditDialog
        open={checkoutOpen}
        onOpenChange={(open) => {
          setCheckoutOpen(open);
          if (!open && !paymentOpen) {
            if (payRoomId) setOpenRoomId(payRoomId);
            setPayRoomId(null);
          }
        }}
        pending={checkoutBusy}
        roomName={payRoom?.name ?? ""}
        startTime={payBill?.startTime ?? new Date().toISOString()}
        hourlyRate={payRoom?.hourly_rate ?? 0}
        items={payBill?.items ?? []}
        staffTotal={payBill?.staffTotal ?? 0}
        onConfirm={(audit) => {
          void runPrepareCheckout(audit);
        }}
      />

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) {
            setPayment(null);
            if (payRoomId && !checkoutOpen) {
              setOpenRoomId(payRoomId);
              setPayRoomId(null);
            }
          }
        }}
        pending={checkoutBusy || busy}
        payment={payment}
        cashierName={cashierName}
        onAdjustLine={(productId, delta) => {
          if (!payment || !payRoom) return;
          if (delta < 0) {
            requestReduce(payment.invoiceId, productId, true);
            return;
          }
          applyLocalDelta(payRoom.id, productId, 1);
          void (async () => {
            const result = await adjustInvoiceItem(payment.invoiceId, productId, 1);
            if (!result.ok) {
              applyLocalDelta(payRoom.id, productId, -1);
              notify(result, "Đã thêm 1");
              return;
            }
            toast.add({ title: "Đã thêm 1", type: "success" });
            refreshPaymentCheckout(payment.invoiceId);
          })();
        }}
        onConfirmPaid={(pay) => {
          if (!payment || !payRoom || !payBill) return;
          const paidRoomId = payRoom.id;
          const snapshotBill = payBill;
          const snapshotPayment = payment;
          setPaymentOpen(false);
          setPayment(null);
          setPayRoomId(null);
          setRooms((current) =>
            current.map((item) =>
              item.id === paidRoomId ? { ...item, status: "CLEANING" as const } : item,
            ),
          );
          setBills((current) => {
            const next = { ...current };
            delete next[paidRoomId];
            return next;
          });
          setOpenRoomId(null);
          setBusy(true);
          void (async () => {
            try {
              const result = await confirmPaid({
                invoiceId: snapshotPayment.invoiceId,
                method: pay.method,
                cashAmount: pay.cashAmount,
                transferAmount: pay.transferAmount,
              });
              if (!result.ok) {
                setRooms((current) =>
                  current.map((item) =>
                    item.id === paidRoomId
                      ? { ...item, status: "IN_USE" as const }
                      : item,
                  ),
                );
                setBills((current) => ({
                  ...current,
                  [paidRoomId]: snapshotBill,
                }));
                setPayment(snapshotPayment);
                setPaymentOpen(true);
                setPayRoomId(paidRoomId);
                notify(result, "Đã thu tiền");
                return;
              }
              toast.add({ title: "Đã thu tiền", type: "success" });
            } finally {
              setBusy(false);
            }
          })();
        }}
      />

      <ManagerPinDialog
        open={pinOpen}
        onOpenChange={(open) => {
          setPinOpen(open);
          if (!open) setPendingReduce(null);
        }}
        pending={locked}
        onConfirm={(pin) => {
          if (!pendingReduce || !payRoom) return;
          const target = pendingReduce;
          const roomId = payRoom.id;
          applyLocalDelta(roomId, target.productId, -1);
          setPinOpen(false);
          setPendingReduce(null);
          void (async () => {
            const result = await adjustInvoiceItem(
              target.invoiceId,
              target.productId,
              -1,
              pin,
            );
            if (!result.ok) {
              applyLocalDelta(roomId, target.productId, 1);
              notify(result, "Đã bớt 1");
              return;
            }
            toast.add({ title: "Đã bớt 1", type: "success" });
            if (target.refreshPayment) {
              refreshPaymentCheckout(target.invoiceId);
            }
          })();
        }}
      />

      <RevenueBoard open={revenueOpen} onOpenChange={setRevenueOpen} />
    </div>
  );
}

function BillList({
  items,
  pending,
  onAdd,
  onReduce,
}: {
  items: InvoiceItem[];
  pending: boolean;
  onAdd: (productId: string) => void;
  onReduce: (productId: string) => void;
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
            key={item.product_id}
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
              aria-label={`Bớt ${item.name} (cần PIN quản lý)`}
              disabled={pending || item.ordered_qty <= 0}
              onClick={() => onReduce(item.product_id)}
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
              onClick={() => onAdd(item.product_id)}
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
