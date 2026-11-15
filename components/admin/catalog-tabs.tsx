"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";

export function CatalogTabs({
  active,
  menuPanel,
  inventoryPanel,
}: {
  active: "menu" | "inventory";
  menuPanel: ReactNode;
  inventoryPanel: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        const next = value === "inventory" ? "inventory" : "menu";
        const href = next === "inventory" ? `${pathname}?tab=inventory` : pathname;
        router.replace(href, { scroll: false });
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="menu">Thực đơn</AdminTabsTrigger>
        <AdminTabsTrigger value="inventory">Nhập hàng / Kho</AdminTabsTrigger>
      </AdminTabsList>
      <TabsContent value="menu" className="mt-0">
        {active === "menu" ? menuPanel : null}
      </TabsContent>
      <TabsContent value="inventory" className="mt-0">
        {active === "inventory" ? inventoryPanel : null}
      </TabsContent>
    </Tabs>
  );
}
