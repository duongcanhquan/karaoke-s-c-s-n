"use client";

import { useMemo, useState } from "react";
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
import type { InvoiceItem, StockAuditLine } from "@/lib/pos-types";

function seedRemaining(items: InvoiceItem[]) {
  const next: Record<string, string> = {};
  for (const item of items) {
    next[item.product_id] = String(lineNeedsAudit(item) ? item.remaining_qty : 0);
  }
  return next;
}

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
  const [remaining, setRemaining] = useState(() => seedRemaining(items));
  const [seedKey, setSeedKey] = useState(() =>
    open ? items.map((item) => item.id).join("|") : "",
  );
  const nextSeedKey = open ? items.map((item) => item.id).join("|") : "";
  if (open && nextSeedKey !== seedKey) {
    setSeedKey(nextSeedKey);
    setRemaining(seedRemaining(items));
  }

  const review = useMemo(() => {
    const audit: StockAuditLine[] = [];

    const rows = items.map((item) => {
      const available = availableQty(item.initial_qty, item.ordered_qty);
      const auditLine = lineNeedsAudit(item);
      const raw = remaining[item.product_id] ?? "";
      const parsed = Number(raw);
      const valid =
        !auditLine ||
        (raw.trim() !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= available);
      const remainingQty = auditLine ? (valid ? parsed : item.remaining_qty) : 0;
      const consumed = consumedFromRemaining(item.initial_qty, item.ordered_qty, remainingQty);

      if (auditLine) {
        audit.push({
          productId: item.product_id,
          remainingQty: valid ? parsed : remainingQty,
        });
      }

      return { item, available, auditLine, consumed, valid };
    });

    const bad = rows.find((row) => row.auditLine && !row.valid);
    const error = bad
      ? `Số còn lại của ${bad.item.name} phải từ 0 đến ${bad.available}.`
      : null;

    return { rows, error, audit };
  }, [items, remaining]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Kiểm đồ bàn giao · {roomName}</DialogTitle>
          <DialogDescription>
            Nhập số đồ còn lại chưa mở. Đã dùng = có sẵn + gọi thêm − còn lại.
          </DialogDescription>
        </DialogHeader>
        <ElapsedClock startTime={startTime} hourlyRate={hourlyRate} />
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Không có món. Chỉ tính giờ phòng và phục vụ.
          </p>
        ) : (
          <div className="max-h-80 w-full overflow-auto">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Món</TableHead>
                    <TableHead className="text-right">Có sẵn</TableHead>
                    <TableHead className="text-right">Gọi thêm</TableHead>
                    <TableHead className="text-right">Đồ còn lại (chưa mở)</TableHead>
                    <TableHead className="text-right">Đã dùng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.rows.map((row) => (
                    <TableRow key={row.item.product_id}>
                      <TableCell>
                        {row.item.name}
                        {row.auditLine ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Tủ minibar
                          </span>
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
                            aria-label={`Đồ còn lại của ${row.item.name}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={row.available}
                            step={1}
                            value={remaining[row.item.product_id] ?? ""}
                            onChange={(event) =>
                              setRemaining((current) => ({
                                ...current,
                                [row.item.product_id]: event.target.value,
                              }))
                            }
                            className="ml-auto min-h-14 w-28 text-right font-mono text-lg font-bold tabular-nums"
                            aria-invalid={!row.valid}
                          />
                        ) : (
                          <span className="font-mono tabular-nums">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-lg font-bold tabular-nums">
                        {row.consumed}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        {staffTotal > 0 ? (
          <p className="text-sm text-muted-foreground">
            Có phí phục vụ — số tiền sẽ hiện ở bước thanh toán.
          </p>
        ) : null}
        {review.error ? (
          <p role="alert" className="text-sm text-destructive">
            {review.error}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:flex-col">
          <Button
            type="button"
            className="h-16 w-full text-2xl font-bold"
            disabled={pending || Boolean(review.error)}
            onClick={() => onConfirm(review.audit)}
          >
            {pending ? "Đang tính…" : "Tính tiền & thanh toán"}
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
