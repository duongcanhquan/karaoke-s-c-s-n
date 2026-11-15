import { Suspense } from "react";
import { WorkModeSwitch } from "@/components/work-mode-switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCachedDashboardStats } from "@/lib/admin-data";

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
  const stats = await getCachedDashboardStats();
  if (stats.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chưa kết nối được dữ liệu</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {stats.error}
          </p>
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { label: "Phòng đang hát", value: stats.inUse },
    { label: "Hóa đơn mở", value: stats.openInvoices },
    { label: "Món trong kho", value: stats.productCount },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((stat) => (
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
            Quản lý có thể làm thu ngân bất cứ lúc nào — bấm “Làm quầy thu ngân”.
          </p>
        </div>
        <WorkModeSwitch mode="pos" className="min-h-12 px-5 text-base" label="Làm quầy thu ngân" />
      </div>
      <Suspense fallback={<DashboardFallback />}>
        <DashboardStats />
      </Suspense>
    </section>
  );
}
