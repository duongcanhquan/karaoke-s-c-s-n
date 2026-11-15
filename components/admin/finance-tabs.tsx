"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";

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
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        const next =
          value === "expenses" ? "expenses" : value === "summary" ? "summary" : "revenue";
        const href = next === "revenue" ? pathname : `${pathname}?tab=${next}`;
        router.replace(href, { scroll: false });
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="revenue">Doanh thu</AdminTabsTrigger>
        <AdminTabsTrigger value="expenses">Chi phí</AdminTabsTrigger>
        <AdminTabsTrigger value="summary">Tổng hợp</AdminTabsTrigger>
      </AdminTabsList>
      <TabsContent value="revenue" className="mt-0">
        {active === "revenue" ? revenuePanel : null}
      </TabsContent>
      <TabsContent value="expenses" className="mt-0">
        {active === "expenses" ? expensesPanel : null}
      </TabsContent>
      <TabsContent value="summary" className="mt-0">
        {active === "summary" ? summaryPanel : null}
      </TabsContent>
    </Tabs>
  );
}
