"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatVnd } from "@/lib/money";
import type { PaymentCheckout } from "@/lib/pos-types";
import { vietQrImageUrl } from "@/lib/vietqr";

export function PaymentDialog({
  open,
  onOpenChange,
  pending,
  payment,
  onConfirmPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  payment: PaymentCheckout | null;
  onConfirmPaid: () => void;
}) {
  if (!payment) return null;

  const qrSrc = vietQrImageUrl(payment);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Thanh toán {payment.roomName}</DialogTitle>
          <DialogDescription>
            Quét mã VietQR để chuyển khoản. Chỉ bấm Đã thu tiền khi đã nhận đủ.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-full text-center">
            <p className="text-sm font-medium text-slate-500">Tổng tiền</p>
            <p className="font-mono text-4xl font-bold tabular-nums text-slate-950">
              {formatVnd(payment.grandTotal)}
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt={`Mã VietQR thanh toán ${payment.roomName}`}
            width={320}
            height={320}
            className="size-80 max-w-full rounded-lg bg-white"
          />
          <dl className="w-full space-y-1 text-sm text-slate-600">
            <div className="flex justify-between gap-3">
              <dt>Chủ TK</dt>
              <dd className="text-right font-medium text-slate-950">{payment.bankAccountName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>STK</dt>
              <dd className="font-mono tabular-nums text-slate-950">{payment.bankAccountNumber}</dd>
            </div>
          </dl>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="h-16 w-full text-2xl font-bold"
            disabled={pending}
            onClick={onConfirmPaid}
          >
            {pending ? "Đang xác nhận" : "Đã thu tiền"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full text-lg font-bold"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
