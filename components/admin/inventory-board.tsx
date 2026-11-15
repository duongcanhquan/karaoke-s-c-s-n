"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveStock, stocktakeProduct } from "@/app/actions/inventory";
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
import { toast } from "@/components/ui/toast";
import { labelCategory } from "@/lib/catalog";
import { selectClass } from "@/lib/field-class";
import { formatVnd } from "@/lib/money";
import { formatVietnamDateTime } from "@/lib/vietnam-time";

export type InventoryProduct = {
  id: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minibar: boolean;
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
}: {
  products: InventoryProduct[];
  movements: InventoryMovement[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [stocktakeError, setStocktakeError] = useState<string | null>(null);
  const stockProducts = useMemo(
    () => products.filter((product) => product.category !== "SERVICE"),
    [products],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nhập kho</CardTitle>
            <CardDescription>
              Cộng đúng số lượng vào tồn. Hóa đơn thanh toán vẫn trừ kho qua trigger — không bị ghi đè.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                setReceiveError(null);
                startTransition(async () => {
                  const result = await receiveStock({
                    productId: String(data.get("productId") ?? ""),
                    quantity: Number(data.get("quantity")),
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
                  toast.add({ title: "Đã nhập kho", type: "success" });
                  router.refresh();
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
                  defaultValue=""
                  className={selectClass}
                  disabled={stockProducts.length === 0}
                >
                  <option value="" disabled>
                    {stockProducts.length === 0 ? "Chưa có món quản lý tồn" : "Chọn món"}
                  </option>
                  {stockProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · tồn {product.stock}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="receive-qty" className="text-sm font-medium">
                  Số lượng nhập <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="receive-qty"
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  required
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="receive-note" className="text-sm font-medium">
                  Ghi chú
                </label>
                <Input id="receive-note" name="note" className={fieldClass} autoComplete="off" />
              </div>
              {receiveError ? (
                <p role="alert" className="text-sm text-destructive">
                  {receiveError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11" disabled={pending || stockProducts.length === 0}>
                {pending ? "Đang lưu" : "Nhập kho"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kiểm kê</CardTitle>
            <CardDescription>
              Nhập số đếm thực tế. Hệ thống ghi chênh lệch (đếm − sổ) và chỉnh tồn cho khớp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
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
                  router.refresh();
                });
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="stocktake-product" className="text-sm font-medium">
                  Món <span aria-hidden="true">*</span>
                </label>
                <select
                  id="stocktake-product"
                  name="productId"
                  required
                  defaultValue=""
                  className={selectClass}
                  disabled={stockProducts.length === 0}
                >
                  <option value="" disabled>
                    {stockProducts.length === 0 ? "Chưa có món quản lý tồn" : "Chọn món"}
                  </option>
                  {stockProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · sổ {product.stock}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="stocktake-qty" className="text-sm font-medium">
                  Số đếm thực tế <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="stocktake-qty"
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
                <label htmlFor="stocktake-note" className="text-sm font-medium">
                  Ghi chú
                </label>
                <Input id="stocktake-note" name="note" className={fieldClass} autoComplete="off" />
              </div>
              {stocktakeError ? (
                <p role="alert" className="text-sm text-destructive">
                  {stocktakeError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11" disabled={pending || stockProducts.length === 0}>
                {pending ? "Đang lưu" : "Ghi kiểm kê"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tồn kho hiện tại</CardTitle>
          <CardDescription>
            Tồn giảm khi hóa đơn PAID (trừ món SERVICE). Nhập kho / kiểm kê ghi sổ riêng.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có món trong kho.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Món</TableHead>
                    <TableHead>Nhóm</TableHead>
                    <TableHead className="text-right">Giá vốn</TableHead>
                    <TableHead className="text-right">Giá bán</TableHead>
                    <TableHead>Tủ minibar</TableHead>
                    <TableHead className="text-right">Tồn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{labelCategory(product.category)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVnd(product.costPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVnd(product.sellingPrice)}
                      </TableCell>
                      <TableCell>{product.minibar ? "Có" : "Không"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {product.category === "SERVICE"
                          ? "—"
                          : product.stock === 0
                            ? "Hết · 0"
                            : product.stock}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sổ nhập / kiểm kê gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có dòng sổ. Chạy `update_inventory_movements.sql` rồi nhập kho / kiểm kê.
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Món</TableHead>
                    <TableHead className="text-right">Trước</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead className="text-right">Sau</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((move) => (
                    <TableRow key={move.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatVietnamDateTime(move.createdAt)}
                      </TableCell>
                      <TableCell>{typeLabel(move.type)}</TableCell>
                      <TableCell>{move.productName}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {move.before}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {move.delta > 0 ? `+${move.delta}` : move.delta}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {move.after}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{move.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
