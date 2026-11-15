import { Suspense } from "react";
import { connection } from "next/server";
import { AdminRevenueClient } from "@/components/admin/revenue-client";
import { FinanceTabs, type FinanceTab } from "@/components/admin/finance-tabs";
import { ManagerSummaryBoard } from "@/components/admin/manager-summary-board";
import { ExpenseBoard, type ExpenseRow } from "@/components/expenses/expense-board";
import { LoadError } from "@/components/load-error";
import { createDb } from "@/utils/supabase/db";

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
}

function PanelFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true" />
  );
}

async function ExpensesPanel() {
  await connection();
  const supabase = createDb();
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

function resolveTab(tab: string | undefined): FinanceTab {
  if (tab === "expenses") return "expenses";
  if (tab === "summary") return "summary";
  return "revenue";
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const active = resolveTab(params.tab);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tài chính</h1>
        <p className="text-sm text-muted-foreground">
          Doanh thu, chi phí và tổng hợp lương / xuất CSV — gọn trong một chỗ.
        </p>
      </div>
      <FinanceTabs
        active={active}
        revenuePanel={
          active === "revenue" ? (
            <Suspense fallback={<PanelFallback />}>
              <AdminRevenueClient />
            </Suspense>
          ) : null
        }
        expensesPanel={
          active === "expenses" ? (
            <Suspense fallback={<PanelFallback />}>
              <ExpensesPanel />
            </Suspense>
          ) : null
        }
        summaryPanel={
          active === "summary" ? (
            <Suspense fallback={<PanelFallback />}>
              <ManagerSummaryBoard />
            </Suspense>
          ) : null
        }
      />
    </section>
  );
}
