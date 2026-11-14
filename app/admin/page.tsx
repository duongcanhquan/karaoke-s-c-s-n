import { Suspense } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";

function DashboardFallback() {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy="true">
      <p className="sr-only">Đang tải tổng quan</p>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-28 rounded-xl bg-muted motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

async function DashboardStats() {
  const supabase = await createClient();
  const [rooms, invoices, products] = await Promise.all([
    supabase.from("rooms").select("id, status"),
    supabase.from("invoices").select("id").eq("status", "ACTIVE"),
    supabase.from("products").select("id"),
  ]);
  const error = rooms.error ?? invoices.error ?? products.error;
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chưa kết nối được dữ liệu</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  const inUse = (rooms.data ?? []).filter((room) => room.status === "IN_USE").length;
  const stats = [
    { label: "Phòng đang hát", value: inUse },
    { label: "Hóa đơn mở", value: invoices.data?.length ?? 0 },
    { label: "Món trong kho", value: products.data?.length ?? 0 },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold tabular-nums">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            Tình hình phòng và hóa đơn đang mở.
          </p>
        </div>
        <Link href="/pos" className={cn(buttonVariants(), "min-h-11")}>
          Bán hàng
        </Link>
      </div>
      <Suspense fallback={<DashboardFallback />}>
        <DashboardStats />
      </Suspense>
    </section>
  );
}
