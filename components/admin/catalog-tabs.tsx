"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useOptimisticTab } from "@/lib/use-optimistic-tab";

export function CatalogTabs({
  active,
  menuPanel,
  inventoryPanel,
}: {
  active: "menu" | "inventory";
  menuPanel: ReactNode;
  inventoryPanel: ReactNode;
}) {
  const pathname = usePathname();
  const { tab, select } = useOptimisticTab(active, (next) =>
    next === "inventory" ? `${pathname}?tab=inventory` : pathname,
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        select(value === "inventory" ? "inventory" : "menu");
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="menu">Thực đơn</AdminTabsTrigger>
        <AdminTabsTrigger value="inventory">Nhập hàng / Kho</AdminTabsTrigger>
      </AdminTabsList>
      <TabsContent value="menu" className="mt-0">
        {tab === "menu" ? menuPanel : null}
      </TabsContent>
      <TabsContent value="inventory" className="mt-0">
        {tab === "inventory" ? inventoryPanel : null}
      </TabsContent>
    </Tabs>
  );
}
