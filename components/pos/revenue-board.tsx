"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import {
  adjustPaidInvoiceItem,
  getPaidBillDetail,
  listPeriodRevenue,
  verifyAdminPin,
} from "@/app/actions/pos";
import { ManagerPinDialog } from "@/components/pos/manager-pin-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { formatVnd } from "@/lib/money";
import type {
  PaidBillDetail,
  PaymentMethod,
  PeriodRevenue,
  RevenuePeriod,
} from "@/lib/pos-types";
import {
  currentVietnamDate,
  currentVietnamYearMonth,
  formatVietnamDateTime,
  shiftVietnamDate,
  shiftVietnamYearMonth,
} from "@/lib/vietnam-time";

function methodLabel(method: PaymentMethod | null) {
  if (method === "CASH") return "Tiền mặt";
  if (method === "QR") return "QR / chuyển khoản";
  if (method === "SPLIT") return "Tiền mặt + QR";
  return "Chưa ghi";
}

function defaultKey(period: RevenuePeriod) {
  return period === "month" ? currentVietnamYearMonth() : currentVietnamDate();
}

function shiftKey(period: RevenuePeriod, key: string, delta: number) {
  if (period === "month") return shiftVietnamYearMonth(key, delta);
  if (period === "week") return shiftVietnamDate(key, delta * 7);
  return shiftVietnamDate(key, delta);
}

export function RevenueBoard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState<RevenuePeriod>("day");
  const [periodKey, setPeriodKey] = useState(() => defaultKey("day"));
  const [revenue, setRevenue] = useState<PeriodRevenue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PaidBillDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [managerPin, setManagerPin] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinMode, setPinMode] = useState<"unlock" | "adjust">("unlock");
  const [pendingAdjust, setPendingAdjust] = useState<{
    productId: string;
    delta: 1 | -1;
  } | null>(null);
  const [openSync, setOpenSync] = useState(open);

  function load(nextPeriod: RevenuePeriod, nextKey: string) {
    startTransition(async () => {
      const result = await listPeriodRevenue(nextPeriod, nextKey);
      if (!result.ok) {
        setRevenue(null);
        setLoadError(result.error);
        toast.add({ title: "Không tải được doanh thu", description: result.error, type: "error" });
        return;
      }
      setLoadError(null);
      setPeriod(nextPeriod);
      setPeriodKey(nextKey);
      setRevenue(result.data);
    });
  }

  if (open !== openSync) {
    setOpenSync(open);
    if (open) {
      setPeriod("day");
      setPeriodKey(defaultKey("day"));
      setDetail(null);
      setDetailOpen(false);
      setManagerPin(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    load("day", defaultKey("day"));
  }, [open]);

  function openBill(invoiceId: string) {
    startTransition(async () => {
      const result = await getPaidBillDetail(invoiceId);
      if (!result.ok) {
        toast.add({ title: "Không mở được bill", description: result.error, type: "error" });
        return;
      }
      setDetail(result.data);
      setDetailOpen(true);
      setManagerPin(null);
    });
  }

  function refreshDetail(invoiceId: string) {
    startTransition(async () => {
      const [detailResult, periodResult] = await Promise.all([
        getPaidBillDetail(invoiceId),
        listPeriodRevenue(period, periodKey),
      ]);
      if (detailResult.ok) setDetail(detailResult.data);
      if (periodResult.ok) setRevenue(periodResult.data);
    });
  }

  function requestAdjust(productId: string, delta: 1 | -1) {
    setPendingAdjust({ productId, delta });
    if (managerPin) {
      applyAdjust(managerPin, productId, delta);
      return;
    }
    setPinMode("adjust");
    setPinOpen(true);
  }

  function applyAdjust(pin: string, productId: string, delta: 1 | -1) {
    if (!detail) return;
    startTransition(async () => {
      const result = await adjustPaidInvoiceItem(detail.id, productId, delta, pin);
      if (!result.ok) {
        toast.add({ title: "Không sửa được", description: result.error, type: "error" });
        return;
      }
      toast.add({ title: "Đã cập nhật bill đã thu", type: "success" });
      setManagerPin(pin);
      setPinOpen(false);
      setPendingAdjust(null);
      refreshDetail(detail.id);
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden border-l border-white/30 bg-white/80 p-0 backdrop-blur-xl sm:max-w-xl md:max-w-2xl"
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b border-slate-200/80 pr-14">
              <SheetTitle className="text-2xl font-bold text-slate-950">Doanh thu</SheetTitle>
              <SheetDescription className="text-base">
                Đơn đã thu theo ngày / tuần / tháng (giờ Việt Nam). Sửa bill cần PIN quản lý.
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-2 border-b border-slate-200/80 p-3">
              {(
                [
                  ["day", "Hôm nay"],
                  ["week", "Tuần này"],
                  ["month", "Tháng này"],
                ] as const
              ).map(([value, text]) => (
                <Button
                  key={value}
                  type="button"
                  variant={period === value ? "default" : "outline"}
                  className="min-h-12 text-base font-bold"
                  disabled={pending}
                  onClick={() => load(value, defaultKey(value))}
                >
                  {text}
                </Button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-12 px-3"
                disabled={pending || !periodKey}
                onClick={() => load(period, shiftKey(period, periodKey, -1))}
              >
                <ChevronLeft aria-hidden="true" />
                Trước
              </Button>
              <div className="min-w-0 text-center">
                <p className="text-xl font-bold text-slate-950 md:text-2xl">
                  {revenue?.label ?? "…"}
                </p>
                <p className="truncate text-sm text-slate-500">{revenue?.longLabel}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-12 px-3"
                disabled={pending || !periodKey}
                onClick={() => load(period, shiftKey(period, periodKey, 1))}
              >
                Sau
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadError ? (
                <p role="alert" className="text-base text-destructive">
                  {loadError}
                </p>
              ) : null}

              {revenue ? (
                <div className="mb-4 grid gap-3 rounded-2xl bg-slate-950 p-5 text-white sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-sm opacity-80">Tổng doanh thu · {revenue.label}</p>
                    <p className="font-mono text-3xl font-bold tabular-nums">
                      {formatVnd(revenue.grandTotal)}
                    </p>
                    <p className="mt-1 text-sm opacity-80">
                      {revenue.billCount} hóa đơn đã xong ·{" "}
                      {new Set(revenue.bills.map((bill) => bill.roomName)).size} phòng
                    </p>
                  </div>
                  <div>
                    <p className="text-sm opacity-80">Tiền hát</p>
                    <p className="font-mono text-xl font-bold tabular-nums">
                      {formatVnd(revenue.roomTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm opacity-80">Đồ + phục vụ</p>
                    <p className="font-mono text-xl font-bold tabular-nums">
                      {formatVnd(revenue.itemsTotal + revenue.staffTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm opacity-80">Tiền mặt</p>
                    <p className="font-mono text-xl font-bold tabular-nums">
                      {formatVnd(revenue.cashTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm opacity-80">Chuyển khoản / QR</p>
                    <p className="font-mono text-xl font-bold tabular-nums">
                      {formatVnd(revenue.transferTotal)}
                    </p>
                  </div>
                </div>
              ) : null}

              {!revenue && !loadError ? (
                <p className="text-base text-slate-500">Đang tải doanh thu…</p>
              ) : null}

              {revenue && revenue.bills.length === 0 ? (
                <p className="text-base text-slate-500">
                  Chưa có hóa đơn đã thu trong {revenue.label}.
                </p>
              ) : null}

              {revenue && revenue.bills.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {revenue.bills.map((bill) => (
                    <li key={bill.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => openBill(bill.id)}
                        className="flex w-full cursor-pointer flex-col gap-1 rounded-2xl border border-white/50 bg-white/70 p-4 text-left shadow-sm backdrop-blur-md hover:bg-white/90 disabled:opacity-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xl font-bold text-slate-950">{bill.roomName}</p>
                          <p className="font-mono text-xl font-bold tabular-nums text-slate-950">
                            {formatVnd(bill.grandTotal)}
                          </p>
                        </div>
                        <p className="text-sm text-slate-600">
                          Thu lúc {formatVietnamDateTime(bill.endTime)}
                        </p>
                        <p className="text-sm text-slate-600">
                          {bill.billableHours} giờ hát · {methodLabel(bill.paymentMethod)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next);
          if (!next) {
            setDetail(null);
            setManagerPin(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-2xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Bill {detail.roomName}</DialogTitle>
                <DialogDescription>
                  Đã thu {formatVietnamDateTime(detail.endTime)} · {detail.billableHours} giờ hát ·{" "}
                  {methodLabel(detail.paymentMethod)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 rounded-2xl bg-slate-950 p-5 text-white">
                <div className="flex justify-between gap-3">
                  <span>Tiền hát</span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatVnd(detail.roomTotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Đồ đã dùng</span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatVnd(detail.itemsTotal)}
                  </span>
                </div>
                {detail.staffTotal > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>Phục vụ</span>
                    <span className="font-mono font-bold tabular-nums">
                      {formatVnd(detail.staffTotal)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3 border-t border-white/20 pt-3 text-2xl font-bold">
                  <span>Tổng</span>
                  <span className="font-mono tabular-nums">{formatVnd(detail.grandTotal)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!managerPin ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 font-bold"
                    disabled={pending}
                    onClick={() => {
                      setPinMode("unlock");
                      setPinOpen(true);
                    }}
                  >
                    Sửa bill (PIN quản lý)
                  </Button>
                ) : (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                    Đã mở quyền sửa bằng mã quản lý.
                  </p>
                )}
              </div>

              <ul className="flex flex-col gap-3">
                {detail.lines.length === 0 ? (
                  <li className="text-base text-slate-500">Không có món.</li>
                ) : (
                  detail.lines.map((line) => (
                    <li
                      key={`${line.productId}-${line.name}`}
                      className="flex items-center gap-3 rounded-xl border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{line.name}</p>
                        <p className="font-mono text-sm tabular-nums text-slate-500">
                          {formatVnd(line.price)} · {formatVnd(line.amount)}
                        </p>
                      </div>
                      {managerPin ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Bớt ${line.name}`}
                            disabled={pending || !line.canReduce}
                            onClick={() => requestAdjust(line.productId, -1)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-900 disabled:opacity-30"
                          >
                            <Minus aria-hidden="true" className="size-5" strokeWidth={3} />
                          </button>
                          <span className="w-8 text-center font-mono text-xl font-bold">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            aria-label={`Thêm ${line.name}`}
                            disabled={pending}
                            onClick={() => requestAdjust(line.productId, 1)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-30"
                          >
                            <Plus aria-hidden="true" className="size-5" strokeWidth={3} />
                          </button>
                        </>
                      ) : (
                        <span className="font-mono text-xl font-bold tabular-nums">{line.qty}</span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ManagerPinDialog
        open={pinOpen}
        onOpenChange={(next) => {
          setPinOpen(next);
          if (!next) setPendingAdjust(null);
        }}
        pending={pending}
        title="Mã PIN quản lý"
        description={
          pinMode === "unlock"
            ? "Nhập mã quản lý để mở quyền sửa bill đã thanh toán."
            : "Xác nhận thêm/bớt món trên bill đã thu."
        }
        onConfirm={(pin) => {
          if (pinMode === "unlock") {
            startTransition(async () => {
              const result = await verifyAdminPin(pin);
              if (!result.ok) {
                toast.add({ title: "Không mở được", description: result.error, type: "error" });
                return;
              }
              setManagerPin(pin);
              setPinOpen(false);
              toast.add({ title: "Đã mở quyền sửa bill", type: "success" });
            });
            return;
          }
          if (!pendingAdjust) return;
          applyAdjust(pin, pendingAdjust.productId, pendingAdjust.delta);
        }}
      />
    </>
  );
}
