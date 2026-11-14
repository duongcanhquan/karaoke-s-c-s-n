"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ElapsedClock } from "@/components/pos/elapsed-clock";
import {
  availableQty,
  consumedFromRemaining,
  lineNeedsAudit,
} from "@/lib/billing";
import { formatVnd, roundMoney } from "@/lib/money";
import type { InvoiceItem, StockAuditLine } from "@/lib/pos-types";

export function StockAuditDialog({
  open,
  onOpenChange,
  pending,
  roomName,
  startTime,
  hourlyRate,
  items,
  staffTotal,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  roomName: string;
  startTime: string;
  hourlyRate: number;
  items: InvoiceItem[];
  staffTotal: number;
  onConfirm: (audit: StockAuditLine[]) => void;
}) {
  const [remaining, setRemaining] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const item of items) {
      next[item.id] = String(lineNeedsAudit(item) ? item.remaining_qty : 0);
    }
    setRemaining(next);
  }, [open, items]);

  const review = useMemo(() => {
    let error: string | null = null;
    let productTotal = 0;
    const audit: StockAuditLine[] = [];

    const rows = items.map((item) => {
      const available = availableQty(item.initial_qty, item.ordered_qty);
      const auditLine = lineNeedsAudit(item);
      const raw = remaining[item.id] ?? "";
      const parsed = Number(raw);
      const valid =
        !auditLine ||
        (raw.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= available);
      const remainingQty = auditLine ? (valid ? parsed : item.remaining_qty) : 0;
      const consumed = consumedFromRemaining(item.initial_qty, item.ordered_qty, remainingQty);

      if (auditLine && !valid && !error) {
        error = `Số còn lại của ${item.name} phải là số nguyên từ 0 đến ${available}.`;
      }
      if (auditLine) audit.push({ itemId: item.id, remainingQty: valid ? parsed : remainingQty });
      if (valid || !auditLine) productTotal += consumed * item.price;

      return { item, available, auditLine, consumed, valid, amount: consumed * item.price };
    });

    return {
      rows,
      error,
      audit,
      productTotal: roundMoney(productTotal),
    };
  }, [items, remaining]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Kiểm kho trước khi chốt {roomName}</DialogTitle>
          <DialogDescription>
            Với món minibar, nhập số còn lại trong phòng. Số đã dùng = có sẵn + gọi thêm − còn lại.
            Món gọi thường tính hết số đã gọi.
          </DialogDescription>
        </DialogHeader>
        <ElapsedClock startTime={startTime} hourlyRate={hourlyRate} />
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hóa đơn không có món. Chỉ tính giờ phòng và nhân viên.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Món</TableHead>
                  <TableHead className="text-right">Có sẵn</TableHead>
                  <TableHead className="text-right">Gọi thêm</TableHead>
                  <TableHead className="text-right">Còn lại</TableHead>
                  <TableHead className="text-right">Đã dùng</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {review.rows.map((row) => (
                  <TableRow key={row.item.id}>
                    <TableCell>
                      {row.item.name}
                      {row.auditLine ? (
                        <span className="mt-1 block text-xs text-muted-foreground">Minibar</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.item.initial_qty}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.item.ordered_qty}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.auditLine ? (
                        <Input
                          aria-label={`Số còn lại của ${row.item.name}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={row.available}
                          step={1}
                          value={remaining[row.item.id] ?? ""}
                          onChange={(event) =>
                            setRemaining((current) => ({
                              ...current,
                              [row.item.id]: event.target.value,
                            }))
                          }
                          className="ml-auto min-h-11 w-24 text-right font-mono tabular-nums"
                          aria-invalid={!row.valid}
                        />
                      ) : (
                        <span className="font-mono tabular-nums">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.consumed}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Món đã dùng</dt>
            <dd className="font-mono tabular-nums">{formatVnd(review.productTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Nhân viên phục vụ</dt>
            <dd className="font-mono tabular-nums">{formatVnd(staffTotal)}</dd>
          </div>
        </dl>
        {review.error ? (
          <p role="alert" className="text-sm text-destructive">
            {review.error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Quay lại
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={pending || Boolean(review.error)}
            onClick={() => onConfirm(review.audit)}
          >
            {pending ? "Đang chốt" : "Chốt hóa đơn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
