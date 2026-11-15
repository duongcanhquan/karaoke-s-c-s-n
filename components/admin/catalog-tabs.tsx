"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
        <TabsTrigger value="menu" className="min-h-11 px-4 text-base font-bold">
          Thực đơn
        </TabsTrigger>
        <TabsTrigger value="inventory" className="min-h-11 px-4 text-base font-bold">
          Nhập hàng / Kho
        </TabsTrigger>
      </TabsList>
      <TabsContent value="menu" className="mt-0">
        {active === "menu" ? menuPanel : null}
      </TabsContent>
      <TabsContent value="inventory" className="mt-0">
        {active === "inventory" ? inventoryPanel : null}
      </TabsContent>
    </Tabs>
  );
}
