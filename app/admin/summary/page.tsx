import { Suspense } from "react";
import { ManagerSummaryBoard } from "@/components/admin/manager-summary-board";

export default function ManagerSummaryPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng hợp lương & chi phí</h1>
        <p className="text-sm text-muted-foreground">
          Chọn ngày / tuần / tháng. Xuất công ca và việc phục vụ từng nhân viên ra CSV để tính tiền.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
            <p className="sr-only">Đang tải tổng hợp</p>
          </div>
        }
      >
        <ManagerSummaryBoard />
      </Suspense>
    </section>
  );
}
