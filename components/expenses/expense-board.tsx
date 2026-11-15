"use client";

import { useState, useTransition } from "react";
import { logExpense } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatVnd } from "@/lib/money";

export type ExpenseRow = {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
};

const fieldClass = "min-h-11";

export function ExpenseBoard({
  expenses,
  today,
}: {
  expenses: ExpenseRow[];
  today: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await logExpense({
        title: String(data.get("title") ?? ""),
        category: String(data.get("category") ?? ""),
        amount: Number(data.get("amount")),
        date: String(data.get("date") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        toast.add({ title: "Chưa lưu chi phí", description: result.error, type: "error" });
        return;
      }
      form.reset();
      toast.add({ title: "Đã lưu chi phí", type: "success" });
    });
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Ghi chi phí</CardTitle>
          <CardDescription>Mỗi dòng là một khoản trong ngày.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="expense-title" className="text-sm font-medium">
                Tiêu đề <span aria-hidden="true">*</span>
              </label>
              <Input id="expense-title" name="title" required className={fieldClass} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="expense-category" className="text-sm font-medium">
                Nhóm <span aria-hidden="true">*</span>
              </label>
              <Input id="expense-category" name="category" required className={fieldClass} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="expense-amount" className="text-sm font-medium">
                Số tiền (VND) <span aria-hidden="true">*</span>
              </label>
              <Input
                id="expense-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                required
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="expense-date" className="text-sm font-medium">
                Ngày <span aria-hidden="true">*</span>
              </label>
              <Input id="expense-date" name="date" type="date" required defaultValue={today} className={fieldClass} />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? "Đang lưu" : "Lưu chi phí"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chi phí gần đây</CardTitle>
          <CardDescription>{expenses.length} khoản mới nhất.</CardDescription>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có chi phí nào.</p>
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
                {expenses.map((expense) => (
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
    </div>
  );
}
