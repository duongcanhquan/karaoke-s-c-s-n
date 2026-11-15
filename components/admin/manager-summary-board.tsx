"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getManagerSummary,
  listWorkExport,
  type ManagerSummary,
} from "@/app/actions/manager-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { downloadCsv } from "@/lib/csv";
import { formatVnd } from "@/lib/money";
import type { RevenuePeriod } from "@/lib/pos-types";
import {
  currentVietnamDate,
  currentVietnamYearMonth,
  formatVietnamDateTime,
  shiftVietnamDate,
  shiftVietnamYearMonth,
} from "@/lib/vietnam-time";

function defaultKey(period: RevenuePeriod) {
  return period === "month" ? currentVietnamYearMonth() : currentVietnamDate();
}

function shiftKey(period: RevenuePeriod, key: string, delta: number) {
  if (period === "month") return shiftVietnamYearMonth(key, delta);
  if (period === "week") return shiftVietnamDate(key, delta * 7);
  return shiftVietnamDate(key, delta);
}

export function ManagerSummaryBoard() {
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState<RevenuePeriod>("day");
  const [periodKey, setPeriodKey] = useState(() => defaultKey("day"));
  const [summary, setSummary] = useState<ManagerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(nextPeriod: RevenuePeriod, nextKey: string) {
    startTransition(async () => {
      const result = await getManagerSummary(nextPeriod, nextKey);
      if (!result.ok) {
        setSummary(null);
        setError(result.error);
        toast.add({ title: "Không tải được tổng hợp", description: result.error, type: "error" });
        return;
      }
      setError(null);
      setPeriod(nextPeriod);
      setPeriodKey(nextKey);
      setSummary(result.data);
    });
  }

  useEffect(() => {
    load("day", defaultKey("day"));
  }, []);

  function exportWork() {
    startTransition(async () => {
      const result = await listWorkExport(period, periodKey || defaultKey(period));
      if (!result.ok) {
        toast.add({ title: "Không xuất được", description: result.error, type: "error" });
        return;
      }

      const workRows = [
        ["Nhân viên", "Ngày", "Vào ca", "Ra ca", "Số giờ", "Lương giờ", "Lương ca"],
        ...result.workdays.map((row) => [
          row.staffName,
          row.date,
          formatVietnamDateTime(row.startTime),
          formatVietnamDateTime(row.endTime),
          String(row.hours),
          String(row.hourlySalary),
          String(row.shiftPay),
        ]),
      ];
      downloadCsv(`cong-ca-${period}-${periodKey}.csv`, workRows);

      const jobRows = [
        ["Nhân viên", "Phòng", "Thanh toán lúc", "Giờ phục vụ", "Đơn giá trả NV", "Tiền nhận"],
        ...result.jobs.map((row) => [
          row.staffName,
          row.roomName,
          row.paidAt ? formatVietnamDateTime(row.paidAt) : "",
          String(row.hoursWorked),
          String(row.payoutRate),
          String(row.bookingPay),
        ]),
      ];
      downloadCsv(`viec-phuc-vu-${period}-${periodKey}.csv`, jobRows);

      toast.add({
        title: "Đã xuất CSV",
        description: `${result.label}: công ca + việc phục vụ`,
        type: "success",
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Chọn kỳ tổng hợp</CardTitle>
          <CardDescription>
            Lương ca (đã ra ca) + hoa hồng phục vụ (hóa đơn đã thu) + chi phí theo ngày / tuần / tháng
            (giờ Việt Nam).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["day", "Ngày"],
                ["week", "Tuần"],
                ["month", "Tháng"],
              ] as const
            ).map(([value, text]) => (
              <Button
                key={value}
                type="button"
                variant={period === value ? "default" : "outline"}
                className="min-h-12 font-bold"
                disabled={pending}
                onClick={() => load(value, defaultKey(value))}
              >
                {text}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              disabled={pending || !periodKey}
              onClick={() => load(period, shiftKey(period, periodKey, -1))}
            >
              <ChevronLeft aria-hidden="true" />
              Trước
            </Button>
            <div className="min-w-0 text-center">
              <p className="text-xl font-bold">{summary?.label ?? "…"}</p>
              <p className="truncate text-sm text-muted-foreground">{summary?.longLabel}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              disabled={pending || !periodKey}
              onClick={() => load(period, shiftKey(period, periodKey, 1))}
            >
              Sau
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <Button
            type="button"
            className="min-h-12 font-bold"
            disabled={pending || !periodKey}
            onClick={exportWork}
          >
            Xuất công & việc làm (CSV)
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tổng lương ca</CardDescription>
                <CardTitle className="font-mono text-2xl tabular-nums">
                  {formatVnd(summary.shiftPay)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {summary.closedShiftCount} ca đã chốt
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Hoa hồng phục vụ</CardDescription>
                <CardTitle className="font-mono text-2xl tabular-nums">
                  {formatVnd(summary.bookingPay)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {summary.bookingCount} lượt phục vụ
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tổng trả nhân viên</CardDescription>
                <CardTitle className="font-mono text-2xl tabular-nums">
                  {formatVnd(summary.salaryTotal)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Lương ca + hoa hồng
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tổng chi phí</CardDescription>
                <CardTitle className="font-mono text-2xl tabular-nums">
                  {formatVnd(summary.expenseTotal)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {summary.expenseCount} khoản chi
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Lương từng nhân viên · {summary.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.staffPayroll.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có lương trong kỳ này.</p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nhân viên</TableHead>
                        <TableHead className="text-right">Ca</TableHead>
                        <TableHead className="text-right">Lương ca</TableHead>
                        <TableHead className="text-right">Hoa hồng</TableHead>
                        <TableHead className="text-right">Tổng nhận</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.staffPayroll.map((line) => (
                        <TableRow key={line.userId}>
                          <TableCell>{line.name}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {line.shiftCount}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatVnd(line.shiftPay)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatVnd(line.bookingPay)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold tabular-nums">
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

          <Card>
            <CardHeader>
              <CardTitle>Chi phí trong kỳ</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có chi phí trong kỳ này.</p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ngày</TableHead>
                        <TableHead>Tiêu đề</TableHead>
                        <TableHead>Nhóm</TableHead>
                        <TableHead className="text-right">Số tiền</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="font-mono tabular-nums">{expense.date}</TableCell>
                          <TableCell>{expense.title}</TableCell>
                          <TableCell>{expense.category}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatVnd(expense.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
