"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const RevenueBoard = dynamic(
  () => import("@/components/pos/revenue-board").then((mod) => mod.RevenueBoard),
  { ssr: false },
);

export function AdminRevenueClient() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        className="min-h-12 w-fit text-base font-bold"
        onClick={() => setOpen(true)}
      >
        Mở bảng doanh thu
      </Button>
      {open ? <RevenueBoard open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
