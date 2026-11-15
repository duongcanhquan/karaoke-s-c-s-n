"use client";

import { useState } from "react";
import { RevenueBoard } from "@/components/pos/revenue-board";
import { Button } from "@/components/ui/button";

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
      <RevenueBoard open={open} onOpenChange={setOpen} />
    </>
  );
}
