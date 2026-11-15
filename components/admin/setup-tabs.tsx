"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
        <TabsTrigger value="rooms" className="min-h-11 px-4 text-base font-bold">
          Phòng
        </TabsTrigger>
        <TabsTrigger value="minibar" className="min-h-11 px-4 text-base font-bold">
          Setup minibar
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rooms" className="mt-0">
        {current === "rooms" ? roomsPanel : null}
      </TabsContent>
      <TabsContent value="minibar" className="mt-0">
        {current === "minibar" ? minibarPanel : null}
      </TabsContent>
    </Tabs>
  );
}
