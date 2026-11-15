"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";

export function SetupTabs({
  active,
  roomsPanel,
  minibarPanel,
}: {
  active: "rooms" | "minibar";
  roomsPanel: ReactNode;
  minibarPanel: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl =
    searchParams.get("tab") ?? (active === "rooms" ? null : active);
  const current = tabFromUrl === "minibar" ? "minibar" : "rooms";

  return (
    <Tabs
      value={current}
      onValueChange={(value) => {
        const next = value === "minibar" ? "minibar" : "rooms";
        const href = next === "minibar" ? `${pathname}?tab=minibar` : pathname;
        router.replace(href, { scroll: false });
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="rooms">Phòng</AdminTabsTrigger>
        <AdminTabsTrigger value="minibar">Setup minibar</AdminTabsTrigger>
      </AdminTabsList>
      <TabsContent value="rooms" className="mt-0">
        {current === "rooms" ? roomsPanel : null}
      </TabsContent>
      <TabsContent value="minibar" className="mt-0">
        {current === "minibar" ? minibarPanel : null}
      </TabsContent>
    </Tabs>
  );
}