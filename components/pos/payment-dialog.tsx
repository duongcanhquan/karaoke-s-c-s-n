"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { printReceipt } from "@/components/pos/receipt-print";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatVnd, roundMoney } from "@/lib/money";
import type { ConfirmPaymentInput, PaymentCheckout, PaymentMethod } from "@/lib/pos-types";
import { vietQrImageUrl } from "@/lib/vietqr";

export function PaymentDialog({
  open,
  onOpenChange,
  pending,
  payment,
  cashierName,
  onAdjustLine,
  onConfirmPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  payment: PaymentCheckout | null;
  cashierName: string;
  onAdjustLine: (productId: string, delta: 1 | -1) => void;
  onConfirmPaid: (input: Omit<ConfirmPaymentInput, "invoiceId">) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("QR");
  const [cashInput, setCashInput] = useState("");

  useEffect(() => {
    if (!open || !payment) return;
    setMethod("QR");
    setCashInput(String(Math.round(payment.grandTotal / 2)));
  }, [open, payment?.invoiceId, payment?.grandTotal]);

  const amounts = useMemo(() => {
    if (!payment) return { cash: 0, transfer: 0 };
    if (method === "CASH") return { cash: payment.grandTotal, transfer: 0 };
    if (method === "QR") return { cash: 0, transfer: payment.grandTotal };
    const cash = roundMoney(Number(cashInput) || 0);
    const transfer = roundMoney(Math.max(0, payment.grandTotal - cash));
    return { cash, transfer };
  }, [payment, method, cashInput]);

  if (!payment) return null;
  const checkout = payment;

  const bankReady = Boolean(
    checkout.bankBin && checkout.bankAccountNumber && checkout.bankAccountName,
  );
  const needsQr = amounts.transfer > 0;
  const qrOk = !needsQr || bankReady;
  const splitValid =
    method !== "SPLIT" ||
    (amounts.cash > 0 &&
      amounts.transfer > 0 &&
      roundMoney(amounts.cash + amounts.transfer) === roundMoney(checkout.grandTotal));

  function handlePrint() {
    try {
      printReceipt({
        payment: checkout,
        method,
        cashAmount: amounts.cash,
        transferAmount: amounts.transfer,
        cashierName,
      });
      toast.add({ title: "Đã gửi lệnh in hóa đơn", type: "success" });
    } catch (error) {
      toast.add({
        title: "Không in được",
        description: error instanceof Error ? error.message : "Lỗi in",
        type: "error",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-full overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Thanh toán {checkout.roomName}</DialogTitle>
          <DialogDescription>
            Trái: tiền cần thu. Phải: món đã dùng — có thể bớt (cần PIN quản lý) hoặc thêm trước khi thu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-lg font-bold text-slate-950">Tiền</h3>
            <div className="space-y-3 rounded-2xl bg-slate-950 p-5 text-white">
              <div className="flex justify-between gap-3 text-base">
                <span>Tiền hát ({checkout.billableHours} giờ)</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatVnd(checkout.roomTotal)}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-base">
                <span>Đồ đã dùng</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatVnd(checkout.itemsTotal)}
                </span>
              </div>
              {checkout.staffTotal > 0 ? (
                <div className="flex justify-between gap-3 text-base">
                  <span>Phục vụ</span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatVnd(checkout.staffTotal)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-white/20 pt-3 text-2xl font-bold">
                <span>Tổng tiền</span>
                <span className="font-mono tabular-nums">{formatVnd(checkout.grandTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["CASH", "Tiền mặt"],
                  ["QR", "QR"],
                  ["SPLIT", "Kết hợp"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={method === value ? "default" : "outline"}
                  className="min-h-14 text-base font-bold"
                  onClick={() => setMethod(value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {method === "SPLIT" ? (
              <label className="flex flex-col gap-2 text-base font-medium">
                Tiền mặt khách đưa
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={cashInput}
                  onChange={(event) => setCashInput(event.target.value)}
                  className="min-h-14 text-xl font-bold"
                />
                <span className="text-sm text-muted-foreground">
                  Còn chuyển khoản: {formatVnd(amounts.transfer)}
                </span>
              </label>
            ) : null}

            {needsQr ? (
              bankReady ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border bg-white p-4">
                  <p className="font-mono text-2xl font-bold tabular-nums">
                    QR {formatVnd(amounts.transfer)}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={vietQrImageUrl(checkout, amounts.transfer)}
                    alt={`VietQR ${checkout.roomName}`}
                    width={240}
                    height={240}
                    className="size-56 max-w-full rounded-lg bg-white"
                  />
                  <p className="text-center text-sm text-slate-600">
                    {checkout.bankAccountName}
                    <br />
                    {checkout.bankAccountNumber}
                  </p>
                </div>
              ) : (
                <p role="alert" className="text-base text-destructive">
                  Chưa cấu hình tài khoản ngân hàng. Vào Cài đặt hoặc chọn Tiền mặt.
                </p>
              )
            ) : null}

            {!splitValid ? (
              <p role="alert" className="text-sm text-destructive">
                Số tiền mặt phải lớn hơn 0 và nhỏ hơn tổng để kết hợp chuyển khoản.
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
            <h3 className="text-lg font-bold text-slate-950">Sản phẩm đã dùng</h3>
            {checkout.lines.length === 0 ? (
              <p className="text-base text-slate-500">Không có món trên hóa đơn.</p>
            ) : (
              <ul className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
                {checkout.lines.map((line) => (
                  <li
                    key={`${line.productId}-${line.name}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-slate-950">{line.name}</p>
                      <p className="font-mono text-sm tabular-nums text-slate-500">
                        {formatVnd(line.price)} · {formatVnd(line.amount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Bớt ${line.name}`}
                      disabled={pending || !line.canReduce}
                      onClick={() => onAdjustLine(line.productId, -1)}
                      className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-slate-900 text-slate-950 disabled:opacity-30"
                    >
                      <Minus aria-hidden="true" className="size-5" strokeWidth={3} />
                    </button>
                    <span className="w-10 text-center font-mono text-2xl font-bold tabular-nums">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      aria-label={`Thêm ${line.name}`}
                      disabled={pending}
                      onClick={() => onAdjustLine(line.productId, 1)}
                      className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-30"
                    >
                      <Plus aria-hidden="true" className="size-5" strokeWidth={3} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-slate-500">
              Bớt món cần mã PIN quản lý. Sau khi sửa, tổng tiền bên trái cập nhật lại.
            </p>
          </section>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full text-lg font-bold"
            disabled={pending || !qrOk}
            onClick={handlePrint}
          >
            In hóa đơn
          </Button>
          <Button
            type="button"
            className="h-16 w-full text-2xl font-bold"
            disabled={pending || !qrOk || !splitValid}
            onClick={() =>
              onConfirmPaid({
                method,
                cashAmount: amounts.cash,
                transferAmount: amounts.transfer,
              })
            }
          >
            {pending ? "Đang xác nhận" : "Đã thu tiền"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 w-full text-base font-bold"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Quay lại bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
