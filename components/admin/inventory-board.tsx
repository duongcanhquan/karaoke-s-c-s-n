"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createInventoryUnit,
  deleteInventoryUnit,
  receiveStock,
  stocktakeProduct,
  updateProductStockMeta,
} from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { labelCategory } from "@/lib/catalog";
import { selectClass } from "@/lib/field-class";
import {
  defaultInventoryUnits,
  labelStockKind,
  stockKinds,
  stockKindLabel,
} from "@/lib/inventory-meta";
import { formatVnd } from "@/lib/money";
import { formatVietnamDateTime } from "@/lib/vietnam-time";

export type InventoryTab = "receive" | "stocktake" | "catalog" | "units" | "ledger";

function resolveInventoryTab(value: string | null | undefined): InventoryTab {
  if (value === "stocktake" || value === "audit") return "stocktake";
  if (value === "catalog") return "catalog";
  if (value === "units") return "units";
  if (value === "ledger") return "ledger";
  return "receive";
}

export type InventoryProduct = {
  id: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minibar: boolean;
  unit: string;
  packUnit: string;
  unitsPerPack: number;
  stockKind: string;
};

export type InventoryMovement = {
  id: string;
  productName: string;
  type: string;
  before: number;
  delta: number;
  after: number;
  note: string;
  createdAt: string;
};

export type InventoryUnit = {
  id: string;
  name: string;
};

const fieldClass = "min-h-11";

function typeLabel(type: string) {
  if (type === "IN") return "Nhập kho";
  if (type === "STOCKTAKE") return "Kiểm kê";
  if (type === "ADJUST") return "Điều chỉnh";
  return type;
}

export function InventoryBoard({
  products,
  movements,
  units,
  initialTab,
}: {
  products: InventoryProduct[];
  movements: InventoryMovement[];
  units: InventoryUnit[];
  initialTab?: InventoryTab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Prefer live URL so tab switches instantly; fall back to server prop on first paint.
  const active = resolveInventoryTab(searchParams.get("inv") ?? initialTab);
  const [pending, startTransition] = useTransition();
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [stocktakeError, setStocktakeError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [packQty, setPackQty] = useState("1");
  const [looseQty, setLooseQty] = useState("0");

  const stockProducts = useMemo(
    () => products.filter((product) => product.category !== "SERVICE"),
    [products],
  );

  const unitNames = useMemo(() => {
    const fromDb = units.map((unit) => unit.name);
    const merged = [...new Set([...fromDb, ...defaultInventoryUnits])];
    return merged.sort((a, b) => a.localeCompare(b, "vi"));
  }, [units]);

  const selected = stockProducts.find((product) => product.id === selectedId) ?? null;
  const perPack = selected ? Math.max(1, selected.unitsPerPack) : 1;
  const packs = Math.max(0, Math.floor(Number(packQty) || 0));
  const loose = Math.max(0, Math.floor(Number(looseQty) || 0));
  const totalUnits = packs * perPack + loose;

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        const next = resolveInventoryTab(String(value));
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", "inventory");
        if (next === "receive") params.delete("inv");
        else params.set("inv", next);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }}
      className="gap-4"
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-fit">
        <TabsTrigger value="receive" className="min-h-11 px-4 text-base font-bold">
          Nhập hàng
        </TabsTrigger>
        <TabsTrigger value="stocktake" className="min-h-11 px-4 text-base font-bold">
          Kiểm kê
        </TabsTrigger>
        <TabsTrigger value="catalog" className="min-h-11 px-4 text-base font-bold">
          Quy cách món
        </TabsTrigger>
        <TabsTrigger value="units" className="min-h-11 px-4 text-base font-bold">
          Đơn vị
        </TabsTrigger>
        <TabsTrigger value="ledger" className="min-h-11 px-4 text-base font-bold">
          Sổ kho
        </TabsTrigger>
      </TabsList>

      <TabsContent value="receive" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Nhập hàng</CardTitle>
            <CardDescription>
              Nhập theo kiện (thùng/hộp…) và/hoặc đơn vị lẻ (chai/cái…). Hệ thống quy đổi ra tồn gốc
              và ghi sổ rõ ràng.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex max-w-xl flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                setReceiveError(null);
                startTransition(async () => {
                  const result = await receiveStock({
                    productId: String(data.get("productId") ?? ""),
                    packQty: Number(data.get("packQty")),
                    looseQty: Number(data.get("looseQty")),
                    note: String(data.get("note") ?? ""),
                  });
                  if (!result.ok) {
                    setReceiveError(result.error);
                    toast.add({
                      title: "Không nhập được",
                      description: result.error,
                      type: "error",
                    });
                    return;
                  }
                  form.reset();
                  setSelectedId("");
                  setPackQty("1");
                  setLooseQty("0");
                  toast.add({ title: "Đã nhập kho", type: "success" });
                });
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="receive-product" className="text-sm font-medium">
                  Món <span aria-hidden="true">*</span>
                </label>
                <select
                  id="receive-product"
                  name="productId"
                  required
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className={selectClass}
                  disabled={stockProducts.length === 0}
                >
                  <option value="" disabled>
                    {stockProducts.length === 0 ? "Chưa có món quản lý tồn" : "Chọn món"}
                  </option>
                  {stockProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · tồn {product.stock} {product.unit}
                    </option>
                  ))}
                </select>
              </div>

              {selected ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p>
                    Đơn vị gốc: <span className="font-semibold">{selected.unit}</span>
                    {" · "}
                    1 {selected.packUnit} ={" "}
                    <span className="font-semibold">
                      {selected.unitsPerPack} {selected.unit}
                    </span>
                  </p>
                  <p className="mt-1">
                    Loại:{" "}
                    <span className="font-semibold">{labelStockKind(selected.stockKind)}</span>
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="receive-packs" className="text-sm font-medium">
                    Số {selected?.packUnit ?? "kiện"}
                  </label>
                  <Input
                    id="receive-packs"
                    name="packQty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={packQty}
                    onChange={(event) => setPackQty(event.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="receive-loose" className="text-sm font-medium">
                    Thêm lẻ ({selected?.unit ?? "đơn vị"})
                  </label>
                  <Input
                    id="receive-loose"
                    name="looseQty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={looseQty}
                    onChange={(event) => setLooseQty(event.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-base font-semibold text-emerald-900">
                Quy đổi nhập kho:{" "}
                <span className="font-mono tabular-nums">
                  {totalUnits} {selected?.unit ?? "đơn vị"}
                </span>
                {selected && packs > 0 ? (
                  <span className="mt-1 block text-sm font-normal text-emerald-800">
                    {packs} {selected.packUnit} × {perPack} + {loose} lẻ
                  </span>
                ) : null}
              </p>

              <div className="flex flex-col gap-1">
                <label htmlFor="receive-note" className="text-sm font-medium">
                  Ghi chú
                </label>
                <Input
                  id="receive-note"
                  name="note"
                  placeholder="VD: NCC ABC, hóa đơn 128"
                  className={fieldClass}
                />
              </div>

              {receiveError ? (
                <p role="alert" className="text-sm text-destructive">
                  {receiveError}
                </p>
              ) : null}

              <Button type="submit" className="min-h-12" disabled={pending || totalUnits <= 0}>
                {pending ? "Đang nhập" : "Xác nhận nhập hàng"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="stocktake" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Kiểm kê</CardTitle>
            <CardDescription>
              Nhập số đếm thực tế theo đơn vị gốc. Hệ thống ghi chênh lệch vào sổ kho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex max-w-xl flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                setStocktakeError(null);
                startTransition(async () => {
                  const result = await stocktakeProduct({
                    productId: String(data.get("productId") ?? ""),
                    countedQty: Number(data.get("countedQty")),
                    note: String(data.get("note") ?? ""),
                  });
                  if (!result.ok) {
                    setStocktakeError(result.error);
                    toast.add({
                      title: "Không kiểm kê được",
                      description: result.error,
                      type: "error",
                    });
                    return;
                  }
                  form.reset();
                  toast.add({ title: "Đã kiểm kê", type: "success" });
                });
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="take-product" className="text-sm font-medium">
                  Món <span aria-hidden="true">*</span>
                </label>
                <select
                  id="take-product"
                  name="productId"
                  required
                  defaultValue=""
                  className={selectClass}
                  disabled={stockProducts.length === 0}
                >
                  <option value="" disabled>
                    Chọn món
                  </option>
                  {stockProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · sổ {product.stock} {product.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="take-count" className="text-sm font-medium">
                  Số đếm thực tế <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="take-count"
                  name="countedQty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  required
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="take-note" className="text-sm font-medium">
                  Ghi chú
                </label>
                <Input id="take-note" name="note" className={fieldClass} />
              </div>
              {stocktakeError ? (
                <p role="alert" className="text-sm text-destructive">
                  {stocktakeError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-12" disabled={pending}>
                {pending ? "Đang lưu" : "Ghi kiểm kê"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="catalog" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Quy cách &amp; loại tồn</CardTitle>
            <CardDescription>
              Đặt đơn vị gốc, đơn vị kiện, số lượng trong 1 kiện, và phân loại tiêu hao / sử dụng lại.
              Đồ sử dụng lại không bị trừ kho khi thanh toán.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {metaError ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {metaError}
              </p>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Món</TableHead>
                  <TableHead>Tồn</TableHead>
                  <TableHead>Đơn vị gốc</TableHead>
                  <TableHead>Đơn vị kiện</TableHead>
                  <TableHead>1 kiện =</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      Chưa có món kho.
                    </TableCell>
                  </TableRow>
                ) : (
                  stockProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {labelCategory(product.category)}
                          {product.minibar ? " · minibar" : ""}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {product.stock} {product.unit}
                      </TableCell>
                      <TableCell>
                        <select
                          aria-label={`Đơn vị gốc ${product.name}`}
                          defaultValue={product.unit}
                          className={selectClass}
                          id={`unit-${product.id}`}
                          disabled={pending}
                        >
                          {unitNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <select
                          aria-label={`Đơn vị kiện ${product.name}`}
                          defaultValue={product.packUnit}
                          className={selectClass}
                          id={`pack-${product.id}`}
                          disabled={pending}
                        >
                          {unitNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`Số trong kiện ${product.name}`}
                          type="number"
                          min={1}
                          step={1}
                          defaultValue={product.unitsPerPack}
                          className="min-h-11 w-24"
                          id={`per-${product.id}`}
                          disabled={pending}
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          aria-label={`Loại tồn ${product.name}`}
                          defaultValue={product.stockKind}
                          className={selectClass}
                          id={`kind-${product.id}`}
                          disabled={pending}
                        >
                          {stockKinds.map((kind) => (
                            <option key={kind} value={kind}>
                              {stockKindLabel[kind]}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={pending}
                          onClick={() => {
                            const unit = (
                              document.getElementById(`unit-${product.id}`) as HTMLSelectElement
                            )?.value;
                            const packUnit = (
                              document.getElementById(`pack-${product.id}`) as HTMLSelectElement
                            )?.value;
                            const unitsPerPack = Number(
                              (document.getElementById(`per-${product.id}`) as HTMLInputElement)
                                ?.value,
                            );
                            const stockKind = (
                              document.getElementById(`kind-${product.id}`) as HTMLSelectElement
                            )?.value;
                            setMetaError(null);
                            startTransition(async () => {
                              const result = await updateProductStockMeta({
                                productId: product.id,
                                unit,
                                packUnit,
                                unitsPerPack,
                                stockKind,
                              });
                              if (!result.ok) {
                                setMetaError(result.error);
                                toast.add({
                                  title: "Không lưu được",
                                  description: result.error,
                                  type: "error",
                                });
                                return;
                              }
                              toast.add({ title: `Đã cập nhật ${product.name}`, type: "success" });
                            });
                          }}
                        >
                          Lưu
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="units" className="mt-0">
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Thêm đơn vị</CardTitle>
              <CardDescription>VD: cái, chiếc, thùng, đĩa, chai…</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-3"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  setUnitError(null);
                  startTransition(async () => {
                    const result = await createInventoryUnit(String(data.get("name") ?? ""));
                    if (!result.ok) {
                      setUnitError(result.error);
                      toast.add({
                        title: "Không thêm được",
                        description: result.error,
                        type: "error",
                      });
                      return;
                    }
                    form.reset();
                    toast.add({ title: "Đã thêm đơn vị", type: "success" });
                  });
                }}
              >
                <Input
                  name="name"
                  required
                  placeholder="Tên đơn vị"
                  className={fieldClass}
                  disabled={pending}
                />
                {unitError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {unitError}
                  </p>
                ) : null}
                <Button type="submit" className="min-h-11" disabled={pending}>
                  Thêm
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danh sách đơn vị</CardTitle>
              <CardDescription>
                Dùng khi chọn đơn vị gốc / kiện ở tab Quy cách món.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {units.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    Chưa có bảng đơn vị (hoặc chưa chạy SQL). Đang dùng danh sách mặc định:{" "}
                    {defaultInventoryUnits.join(", ")}.
                  </li>
                ) : (
                  units.map((unit) => (
                    <li
                      key={unit.id}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <span className="font-medium">{unit.name}</span>
                      {unit.id.startsWith("default-") ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-10"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              const result = await deleteInventoryUnit(unit.id);
                              if (!result.ok) {
                                toast.add({
                                  title: "Không xóa được",
                                  description: result.error,
                                  type: "error",
                                });
                                return;
                              }
                              toast.add({ title: `Đã xóa ${unit.name}`, type: "success" });
                            });
                          }}
                        >
                          Xóa
                        </Button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="ledger" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Sổ kho gần đây</CardTitle>
            <CardDescription>Nhập / kiểm kê / điều chỉnh — minh bạch từng dòng.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Món</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Trước</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">Sau</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      Chưa có phát sinh.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((move) => (
                    <TableRow key={move.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatVietnamDateTime(move.createdAt)}
                      </TableCell>
                      <TableCell>{move.productName}</TableCell>
                      <TableCell>{typeLabel(move.type)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {move.before}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {move.delta > 0 ? `+${move.delta}` : move.delta}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {move.after}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">
                        {move.note}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Giá vốn tham chiếu:{" "}
              {stockProducts
                .slice(0, 3)
                .map((product) => `${product.name} ${formatVnd(product.costPrice)}`)
                .join(" · ") || "—"}
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
