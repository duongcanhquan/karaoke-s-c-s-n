import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/page-skeleton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {/* Suspense BELOW shared layout — required for instant client navigations. */}
      <Suspense fallback={<PageSkeleton label="Đang tải dữ liệu…" />}>
        {children}
      </Suspense>
    </AppShell>
  );
}
