import { Suspense } from "react";
import { getShopSettings } from "@/app/actions/settings";
import { SettingsBoard } from "@/components/admin/settings-board";
import { LoadError } from "@/components/load-error";

async function SettingsContent() {
  const result = await getShopSettings();
  if (!result.ok) {
    return (
      <LoadError
        message={result.error}
        hint="Chạy file update_settings_schema.sql trong Supabase SQL Editor."
      />
    );
  }
  return <SettingsBoard settings={result.settings} />;
}

export default function SettingsPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Tài khoản ngân hàng dùng cho mã QR thanh toán trên quầy.
        </p>
      </div>
      <Suspense
        fallback={<div className="h-48 max-w-xl rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true" />}
      >
        <SettingsContent />
      </Suspense>
    </section>
  );
}
