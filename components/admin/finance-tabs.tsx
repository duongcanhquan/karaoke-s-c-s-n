"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        const href =
          next === "revenue" ? pathname : `${pathname}?tab=${next}`;
        router.replace(href, { scroll: false });
      }}
      className="gap-4"
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
        <TabsTrigger value="revenue" className="min-h-11 px-4 text-base font-bold">
          Doanh thu
        </TabsTrigger>
        <TabsTrigger value="expenses" className="min-h-11 px-4 text-base font-bold">
          Chi phí
        </TabsTrigger>
        <TabsTrigger value="summary" className="min-h-11 px-4 text-base font-bold">
          Tổng hợp
        </TabsTrigger>
      </TabsList>
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
