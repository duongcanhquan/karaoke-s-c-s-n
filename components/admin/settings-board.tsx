"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  savePrinterSettings,
  saveShopBank,
  saveShopProfile,
  type ShopSettings,
} from "@/app/actions/settings";
import { printTestReceipt } from "@/components/pos/receipt-print";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminTabsList, AdminTabsTrigger } from "@/components/admin/admin-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { vietnamBanks } from "@/lib/banks";
import { selectClass } from "@/lib/field-class";
import { adminFieldClass } from "@/lib/admin-ui";
import { useOptimisticTab } from "@/lib/use-optimistic-tab";
import {
  savePrinterPrefsLocal,
  type ReceiptShopInfo,
} from "@/lib/printer-prefs";

export type SettingsTab = "shop" | "bank" | "printer";

const fieldClass = adminFieldClass;

function toLocalPrefs(settings: ShopSettings): ReceiptShopInfo {
  return {
    shopName: settings.shopName,
    shopAddress: settings.shopAddress,
    shopPhone: settings.shopPhone,
    receiptFooter: settings.receiptFooter,
    printerPaperMm: settings.printerPaperMm,
    printerAutoPrint: settings.printerAutoPrint,
    printerCopies: settings.printerCopies,
    printerName: settings.printerName,
  };
}

export function SettingsBoard({
  settings,
  initialTab = "shop",
}: {
  settings: ShopSettings;
  initialTab?: SettingsTab;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl =
    searchParams.get("tab") ?? (initialTab === "shop" ? null : initialTab);
  const serverTab: SettingsTab =
    tabFromUrl === "bank" || tabFromUrl === "printer" ? tabFromUrl : "shop";
  const { tab: current, select } = useOptimisticTab(serverTab, (next) =>
    next === "shop" ? pathname : `${pathname}?tab=${next}`,
  );
  const [pending, startTransition] = useTransition();
  const [shopError, setShopError] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(settings.printerAutoPrint);
  const [paperMm, setPaperMm] = useState<58 | 80>(settings.printerPaperMm);

  useEffect(() => {
    savePrinterPrefsLocal(toLocalPrefs(settings));
  }, [settings]);

  return (
    <Tabs
      value={current}
      onValueChange={(value) => {
        select(
          value === "bank" ? "bank" : value === "printer" ? "printer" : "shop",
        );
      }}
      className="gap-4"
    >
      <AdminTabsList>
        <AdminTabsTrigger value="shop">Thông tin quán</AdminTabsTrigger>
        <AdminTabsTrigger value="bank">Ngân hàng / QR</AdminTabsTrigger>
        <AdminTabsTrigger value="printer">Máy in</AdminTabsTrigger>
      </AdminTabsList>

      <TabsContent value="shop" className="mt-0">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Thông tin quán</CardTitle>
            <CardDescription>
              In trên đầu hóa đơn. Điền đúng để khách và sổ sách rõ ràng.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setShopError(null);
                startTransition(async () => {
                  const payload = {
                    id: settings.id,
                    shopName: String(data.get("shopName") ?? ""),
                    shopAddress: String(data.get("shopAddress") ?? ""),
                    shopPhone: String(data.get("shopPhone") ?? ""),
                    receiptFooter: String(data.get("receiptFooter") ?? ""),
                  };
                  const result = await saveShopProfile(payload);
                  if (!result.ok) {
                    setShopError(result.error);
                    toast.add({
                      title: "Không lưu được",
                      description: result.error,
                      type: "error",
                    });
                    return;
                  }
                  savePrinterPrefsLocal({
                    ...toLocalPrefs(settings),
                    ...payload,
                    shopName: payload.shopName.trim() || "Karaoke",
                    receiptFooter: payload.receiptFooter.trim() || "Cảm ơn quý khách",
                  });
                  toast.add({ title: "Đã lưu thông tin quán", type: "success" });
                });
              }}
            >
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="shop-name">
                Tên quán
                <Input
                  id="shop-name"
                  name="shopName"
                  required
                  defaultValue={settings.shopName}
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="shop-address">
                Địa chỉ
                <Input
                  id="shop-address"
                  name="shopAddress"
                  defaultValue={settings.shopAddress}
                  placeholder="Số nhà, đường, phường…"
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="shop-phone">
                Điện thoại
                <Input
                  id="shop-phone"
                  name="shopPhone"
                  defaultValue={settings.shopPhone}
                  inputMode="tel"
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="receipt-footer">
                Dòng cuối hóa đơn
                <Input
                  id="receipt-footer"
                  name="receiptFooter"
                  defaultValue={settings.receiptFooter}
                  placeholder="Cảm ơn quý khách"
                  className={fieldClass}
                />
              </label>
              {shopError ? (
                <p role="alert" className="text-sm text-destructive">
                  {shopError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11" disabled={pending}>
                {pending ? "Đang lưu" : "Lưu thông tin quán"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="bank" className="mt-0">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Tài khoản nhận tiền (VietQR)</CardTitle>
            <CardDescription>
              Thu ngân dùng để hiện mã QR khi khách chuyển khoản. Chọn ngân hàng hoặc nhập BIN 6 số.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setBankError(null);
                startTransition(async () => {
                  const result = await saveShopBank({
                    id: settings.id,
                    bankBin: String(data.get("bankBin") ?? ""),
                    bankAccountNumber: String(data.get("bankAccountNumber") ?? ""),
                    bankAccountName: String(data.get("bankAccountName") ?? ""),
                  });
                  if (!result.ok) {
                    setBankError(result.error);
                    toast.add({
                      title: "Không lưu được",
                      description: result.error,
                      type: "error",
                    });
                    return;
                  }
                  toast.add({ title: "Đã lưu tài khoản ngân hàng", type: "success" });
                });
              }}
            >
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="bank-pick">
                Ngân hàng
                <select
                  id="bank-pick"
                  className={selectClass}
                  defaultValue={
                    vietnamBanks.some((bank) => bank.bin === settings.bankBin)
                      ? settings.bankBin
                      : ""
                  }
                  onChange={(event) => {
                    const binInput = document.getElementById("bank-bin") as HTMLInputElement | null;
                    if (binInput && event.target.value) binInput.value = event.target.value;
                  }}
                >
                  <option value="">— Chọn nhanh ngân hàng —</option>
                  {vietnamBanks.map((bank) => (
                    <option key={bank.bin} value={bank.bin}>
                      {bank.name} ({bank.bin})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="bank-bin">
                Mã BIN (6 số)
                <Input
                  id="bank-bin"
                  name="bankBin"
                  required
                  defaultValue={settings.bankBin}
                  inputMode="numeric"
                  className={`${fieldClass} font-mono`}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="bank-account">
                Số tài khoản
                <Input
                  id="bank-account"
                  name="bankAccountNumber"
                  required
                  defaultValue={settings.bankAccountNumber}
                  className={`${fieldClass} font-mono`}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="bank-name">
                Tên chủ tài khoản (in hoa, không dấu)
                <Input
                  id="bank-name"
                  name="bankAccountName"
                  required
                  defaultValue={settings.bankAccountName}
                  className={fieldClass}
                  placeholder="NGUYEN VAN A"
                />
              </label>
              {bankError ? (
                <p role="alert" className="text-sm text-destructive">
                  {bankError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11" disabled={pending}>
                {pending ? "Đang lưu" : "Lưu ngân hàng / QR"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="printer" className="mt-0">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Kết nối máy in hóa đơn</CardTitle>
            <CardDescription>
              App dùng hộp thoại in của Windows/Chrome. Cài máy in nhiệt (58/80mm), đặt làm máy in mặc
              định, rồi bấm In thử. Cho phép popup nếu trình duyệt chặn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setPrinterError(null);
                startTransition(async () => {
                  const payload = {
                    id: settings.id,
                    printerPaperMm: paperMm,
                    printerAutoPrint: autoPrint,
                    printerCopies: Number(data.get("printerCopies") ?? 1),
                    printerName: String(data.get("printerName") ?? ""),
                  };
                  const result = await savePrinterSettings(payload);
                  if (!result.ok) {
                    setPrinterError(result.error);
                    toast.add({
                      title: "Không lưu được",
                      description: result.error,
                      type: "error",
                    });
                    return;
                  }
                  savePrinterPrefsLocal({
                    ...toLocalPrefs(settings),
                    printerPaperMm: paperMm,
                    printerAutoPrint: autoPrint,
                    printerCopies: Math.min(3, Math.max(1, payload.printerCopies)),
                    printerName: payload.printerName.trim(),
                  });
                  toast.add({ title: "Đã lưu máy in", type: "success" });
                });
              }}
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Khổ giấy</legend>
                <div className="flex flex-wrap gap-2">
                  {([58, 80] as const).map((size) => (
                    <Button
                      key={size}
                      type="button"
                      variant={paperMm === size ? "default" : "outline"}
                      className="min-h-11"
                      onClick={() => setPaperMm(size)}
                    >
                      {size} mm
                    </Button>
                  ))}
                </div>
              </fieldset>

              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="printer-name">
                Tên máy in (ghi chú)
                <Input
                  id="printer-name"
                  name="printerName"
                  defaultValue={settings.printerName}
                  placeholder="VD: Xprinter XP-58 / máy quầy"
                  className={fieldClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="printer-copies">
                Số liên in mỗi lần
                <Input
                  id="printer-copies"
                  name="printerCopies"
                  type="number"
                  min={1}
                  max={3}
                  step={1}
                  defaultValue={settings.printerCopies}
                  className={fieldClass}
                />
              </label>

              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={autoPrint}
                  onChange={(event) => setAutoPrint(event.target.checked)}
                />
                Tự in hóa đơn ngay sau khi bấm “Đã thu tiền”
              </label>

              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Cách gắn máy in</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Cắm USB / cài driver máy in nhiệt trên Windows.</li>
                  <li>Vào Cài đặt Windows → Máy in → đặt máy nhiệt làm mặc định.</li>
                  <li>Chrome: khi in, chọn đúng máy và tắt “Headers and footers”.</li>
                  <li>Bấm “In thử” bên dưới để kiểm tra khổ giấy.</li>
                </ol>
              </div>

              {printerError ? (
                <p role="alert" className="text-sm text-destructive">
                  {printerError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? "Đang lưu" : "Lưu máy in"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => {
                    try {
                      printTestReceipt({
                        ...toLocalPrefs(settings),
                        printerPaperMm: paperMm,
                        printerAutoPrint: autoPrint,
                        printerName:
                          (document.getElementById("printer-name") as HTMLInputElement)?.value ??
                          settings.printerName,
                        printerCopies: Number(
                          (document.getElementById("printer-copies") as HTMLInputElement)?.value ||
                            1,
                        ),
                      });
                      toast.add({ title: "Đã mở bản in thử", type: "success" });
                    } catch (error) {
                      toast.add({
                        title: "Không in được",
                        description:
                          error instanceof Error ? error.message : "Cho phép popup rồi thử lại",
                        type: "error",
                      });
                    }
                  }}
                >
                  In thử
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
