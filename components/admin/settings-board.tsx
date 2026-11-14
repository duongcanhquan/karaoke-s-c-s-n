"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveShopSettings, type ShopSettings } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export function SettingsBoard({ settings }: { settings: ShopSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Tài khoản nhận tiền</CardTitle>
        <CardDescription>
          Dùng để tạo mã VietQR khi thu ngân xác nhận thanh toán. Ví dụ Vietcombank BIN 970436.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              const result = await saveShopSettings({
                id: settings.id,
                bankBin: String(data.get("bankBin") ?? ""),
                bankAccountNumber: String(data.get("bankAccountNumber") ?? ""),
                bankAccountName: String(data.get("bankAccountName") ?? ""),
              });
              if (!result.ok) {
                setError(result.error);
                toast.add({ title: "Không lưu được", description: result.error, type: "error" });
                return;
              }
              toast.add({ title: "Đã lưu tài khoản", type: "success" });
              router.refresh();
            });
          }}
        >
          <label htmlFor="bank-bin" className="flex flex-col gap-1 text-sm font-medium">
            Mã BIN ngân hàng
            <Input
              id="bank-bin"
              name="bankBin"
              required
              defaultValue={settings.bankBin}
              inputMode="numeric"
              className="min-h-11 font-mono"
            />
          </label>
          <label htmlFor="bank-account" className="flex flex-col gap-1 text-sm font-medium">
            Số tài khoản
            <Input
              id="bank-account"
              name="bankAccountNumber"
              required
              defaultValue={settings.bankAccountNumber}
              className="min-h-11 font-mono"
            />
          </label>
          <label htmlFor="bank-name" className="flex flex-col gap-1 text-sm font-medium">
            Tên chủ tài khoản
            <Input
              id="bank-name"
              name="bankAccountName"
              required
              defaultValue={settings.bankAccountName}
              className="min-h-11"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="min-h-11" disabled={pending}>
            {pending ? "Đang lưu" : "Lưu cấu hình"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
