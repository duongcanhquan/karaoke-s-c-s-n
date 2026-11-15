import { Suspense } from "react";
import { getShopSettings } from "@/app/actions/settings";
import { SettingsBoard, type SettingsTab } from "@/components/admin/settings-board";
import { LoadError } from "@/components/load-error";

function resolveSettingsTab(tab: string | undefined): SettingsTab {
  if (tab === "bank") return "bank";
  if (tab === "printer") return "printer";
  return "shop";
}

async function SettingsContent({ active }: { active: SettingsTab }) {
  const result = await getShopSettings();
  if (!result.ok) {
    return (
      <LoadError
        message={result.error}
        hint="Chạy update_shop_settings_full.sql (hoặc update_settings_schema.sql) trong Supabase SQL Editor."
      />
    );
  }
  return <SettingsBoard settings={result.settings} initialTab={active} />;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const active = resolveSettingsTab(params.tab);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Thông tin quán trên hóa đơn, tài khoản VietQR, và kết nối máy in nhiệt.
        </p>
      </div>
      <Suspense
        fallback={
          <div
            className="h-48 max-w-xl rounded-xl bg-muted motion-safe:animate-pulse"
            aria-busy="true"
          />
        }
      >
        <SettingsContent active={active} />
      </Suspense>
    </section>
  );
}
