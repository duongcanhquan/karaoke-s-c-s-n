"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useOptimisticTab } from "@/lib/use-optimistic-tab";

export function SetupTabs({
  active,
  roomsPanel,
  minibarPanel,
}: {
  active: "rooms" | "minibar";
  roomsPanel: ReactNode;
  minibarPanel: ReactNode;
}) {
  const pathname = usePathname();
  // Both panels are already on the page — switch instantly, sync URL in background.
  const { tab, select } = useOptimisticTab(active, (next) =>
    next === "minibar" ? `${pathname}?tab=minibar` : pathname,
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        select(value === "minibar" ? "minibar" : "rooms");
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="rooms">Phòng</AdminTabsTrigger>
        <AdminTabsTrigger value="minibar">Setup minibar</AdminTabsTrigger>
      </AdminTabsList>
      <TabsContent value="rooms" className="mt-0">
        {tab === "rooms" ? roomsPanel : null}
      </TabsContent>
      <TabsContent value="minibar" className="mt-0">
        {tab === "minibar" ? minibarPanel : null}
      </TabsContent>
    </Tabs>
  );
}