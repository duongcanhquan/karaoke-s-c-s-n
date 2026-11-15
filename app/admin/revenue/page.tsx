import { Suspense } from "react";
import { AdminRevenueClient } from "@/components/admin/revenue-client";

export default function AdminRevenuePage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Doanh thu theo tháng</h1>
        <p className="text-sm text-muted-foreground">
          Xem rõ từng tháng (ví dụ Tháng 11 / 2026). Nhân viên cũng mở từ quầy POS nút Doanh thu.
          Sửa bill đã thanh toán bắt buộc mã PIN quản lý.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
            <p className="sr-only">Đang tải doanh thu</p>
          </div>
        }
      >
        <AdminRevenueClient />
      </Suspense>
    </section>
  );
}
