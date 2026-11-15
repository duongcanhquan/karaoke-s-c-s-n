"use client";

import { useState, useTransition } from "react";
import { deleteExpense, logExpense, updateExpense } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "@/components/ui/toast";
import { adminFieldClass } from "@/lib/admin-ui";
import { formatVnd } from "@/lib/money";

export type ExpenseRow = {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
};

const fieldClass = adminFieldClass;

function ExpenseFields({
  idPrefix,
  expense,
  today,
}: {
  idPrefix: string;
  expense?: ExpenseRow;
  today: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-title`} className="text-sm font-medium">
          Tiêu đề <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-title`}
          name="title"
          required
          defaultValue={expense?.title}
          className={fieldClass}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium">
          Nhóm <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-category`}
          name="category"
          required
          defaultValue={expense?.category}
          className={fieldClass}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-amount`} className="text-sm font-medium">
          Số tiền (VND) <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-amount`}
          name="amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          required
          defaultValue={expense?.amount}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-date`} className="text-sm font-medium">
          Ngày <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-date`}
          name="date"
          type="date"
          required
          defaultValue={expense?.date ?? today}
          className={fieldClass}
        />
      </div>
    </>
  );
}

function readExpense(data: FormData) {
  return {
    title: String(data.get("title") ?? ""),
    category: String(data.get("category") ?? ""),
    amount: Number(data.get("amount")),
    date: String(data.get("date") ?? ""),
  };
}

export function ExpenseBoard({
  expenses,
  today,
}: {
  expenses: ExpenseRow[];
  today: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [removing, setRemoving] = useState<ExpenseRow | null>(null);
  const [deletePin, setDeletePin] = useState("");

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        toast.add({ title: "Không thực hiện được", description: result.error, type: "error" });
        return;
      }
      toast.add({ title: success, type: "success" });
      after?.();
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
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const input = readExpense(new FormData(form));
              run(() => logExpense(input), "Đã lưu chi phí", () => form.reset());
            }}
          >
            <ExpenseFields idPrefix="create" today={today} />
            {error && !editing && !removing ? (
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
                    <TableHead>Thao tác</TableHead>
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
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={pending}
                            onClick={() => {
                              setError(null);
                              setEditing(expense);
                            }}
                          >
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="min-h-11"
                            disabled={pending}
                            onClick={() => {
                              setError(null);
                              setDeletePin("");
                              setRemoving(expense);
                            }}
                          >
                            Xóa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-full overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa chi phí</DialogTitle>
            <DialogDescription>Cập nhật tiêu đề, nhóm, số tiền hoặc ngày.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              key={editing.id}
              className="flex w-full flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const id = editing.id;
                const input = readExpense(new FormData(event.currentTarget));
                run(() => updateExpense({ id, ...input }), "Đã cập nhật chi phí", () =>
                  setEditing(null),
                );
              }}
            >
              <ExpenseFields idPrefix="edit" expense={editing} today={today} />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setEditing(null)}
                >
                  Hủy
                </Button>
                <Button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? "Đang lưu" : "Lưu"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setDeletePin("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa chi phí?</DialogTitle>
            <DialogDescription>
              {removing
                ? `Xóa “${removing.title}” — cần PIN quản lý.`
                : "Cần mã PIN quản lý."}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="PIN quản lý"
            value={deletePin}
            onChange={(event) => setDeletePin(event.target.value)}
            className="min-h-12 text-center text-xl font-bold tracking-[0.3em]"
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setRemoving(null);
                setDeletePin("");
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending || !removing || !deletePin.trim()}
              onClick={() => {
                if (!removing) return;
                const pin = deletePin.trim();
                run(
                  () => deleteExpense(removing.id, pin),
                  "Đã xóa chi phí",
                  () => {
                    setRemoving(null);
                    setDeletePin("");
                  },
                );
              }}
            >
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
