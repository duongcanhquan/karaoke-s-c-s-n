"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useOptimisticTab } from "@/lib/use-optimistic-tab";

export type FinanceTab = "revenue" | "expenses" | "summary";

export function FinanceTabs({
  active,
  revenuePanel,
  expensesPanel,
  summaryPanel,
}: {
  active: FinanceTab;
  revenuePanel: ReactNode;
  expensesPanel: ReactNode;
  summaryPanel: ReactNode;
}) {
  const pathname = usePathname();
  const { tab, select } = useOptimisticTab(active, (next) =>
    next === "revenue" ? pathname : `${pathname}?tab=${next}`,
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next =
          value === "expenses" ? "expenses" : value === "summary" ? "summary" : "revenue";
        select(next);
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="revenue">Doanh thu</AdminTabsTrigger>
        <AdminTabsTrigger value="expenses">Chi phí</AdminTabsTrigger>
        <AdminTabsTrigger value="summary">Tổng hợp</AdminTabsTrigger>
      </AdminTabsList>
      <TabsContent value="revenue" className="mt-0">
        {tab === "revenue" ? revenuePanel : null}
      </TabsContent>
      <TabsContent value="expenses" className="mt-0">
        {tab === "expenses" ? expensesPanel : null}
      </TabsContent>
      <TabsContent value="summary" className="mt-0">
        {tab === "summary" ? summaryPanel : null}
      </TabsContent>
    </Tabs>
  );
}
