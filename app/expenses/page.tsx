import { Suspense } from "react";
import { connection } from "next/server";
import { ExpenseBoard, type ExpenseRow } from "@/components/expenses/expense-board";
import { LoadError } from "@/components/load-error";
import { createClient } from "@/utils/supabase/server";

function ExpensesFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
      <p className="sr-only">Đang tải chi phí</p>
    </div>
  );
}

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

async function ExpensesContent() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("id, title, category, amount, date")
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError message={error.message} />
        <ExpenseBoard expenses={[]} today={todayInVietnam()} />
      </div>
    );
  }

  const expenses: ExpenseRow[] = (data ?? []).map((expense) => ({
    id: String(expense.id),
    title: String(expense.title),
    category: String(expense.category),
    amount: Number(expense.amount),
    date: String(expense.date),
  }));

  return <ExpenseBoard expenses={expenses} today={todayInVietnam()} />;
}

export default function ExpensesPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">Ghi khoản chi và xem 50 dòng gần nhất.</p>
      </div>
      <Suspense fallback={<ExpensesFallback />}>
        <ExpensesContent />
      </Suspense>
    </section>
  );
}
