"use client";

import { useState, useTransition } from "react";
import { createProduct, deleteProduct, setMinibarItem, updateProduct } from "@/app/actions/products";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { categoryLabel, labelCategory, productCategories, type ProductCategory } from "@/lib/catalog";
import { selectClass } from "@/lib/field-class";
import { formatVnd } from "@/lib/money";

export type MenuProduct = {
  id: string;
  name: string;
  displayName: string;
  category: ProductCategory;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  isMinibar: boolean;
};

const fieldClass = "min-h-11";

function notify(ok: boolean, success: string, error?: string) {
  if (ok) {
    toast.add({ title: success, type: "success" });
    return;
  }
  toast.add({ title: "Không thực hiện được", description: error, type: "error" });
}

function ProductFields({
  idPrefix,
  product,
}: {
  idPrefix: string;
  product?: MenuProduct;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
          Tên nội bộ <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          defaultValue={product?.name}
          className={fieldClass}
          placeholder="VD: Bia HN thùng"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-display`} className="text-sm font-medium">
          Tên hiển thị (hóa đơn / quầy) <span aria-hidden="true">*</span>
        </label>
        <Input
          id={`${idPrefix}-display`}
          name="displayName"
          required
          defaultValue={product?.displayName || product?.name}
          className={fieldClass}
          placeholder="VD: Bia Hà Nội"
        />
        <p className="text-xs text-muted-foreground">
          Tên khách thấy trên màn hình và hóa đơn — đổi được mà không đổi tên kho.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-category`} className="text-sm font-medium">
          Nhóm <span aria-hidden="true">*</span>
        </label>
        <select
          id={`${idPrefix}-category`}
          name="category"
          required
          defaultValue={product?.category ?? "DRINK"}
          className={selectClass}
        >
          {productCategories.map((category) => (
            <option key={category} value={category}>
              {categoryLabel[category]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-cost`} className="text-sm font-medium">
            Giá vốn <span aria-hidden="true">*</span>
          </label>
          <Input
            id={`${idPrefix}-cost`}
            name="costPrice"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            required
            defaultValue={product?.costPrice ?? 0}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-sell`} className="text-sm font-medium">
            Giá hiển thị / bán <span aria-hidden="true">*</span>
          </label>
          <Input
            id={`${idPrefix}-sell`}
            name="sellingPrice"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            required
            defaultValue={product?.sellingPrice ?? 0}
            className={fieldClass}
          />
        </div>
      </div>
      {product ? (
        <>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Tồn kho sửa ở <span className="font-semibold">Kho hàng</span> (nhập / kiểm kê) — không
            ghi đè khi sửa món.
          </p>
          <input type="hidden" name="stockQuantity" value={String(product.stock)} />
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-stock`} className="text-sm font-medium">
            Tồn kho ban đầu <span aria-hidden="true">*</span>
          </label>
          <Input
            id={`${idPrefix}-stock`}
            name="stockQuantity"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
            defaultValue={0}
            className={fieldClass}
          />
        </div>
      )}
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          name="isMinibarItem"
          type="checkbox"
          defaultChecked={product?.isMinibar ?? false}
          className="size-5 cursor-pointer accent-current"
        />
        Tủ minibar
      </label>
    </>
  );
}

function readProduct(data: FormData) {
  return {
    name: String(data.get("name") ?? ""),
    displayName: String(data.get("displayName") ?? ""),
    category: String(data.get("category") ?? ""),
    costPrice: Number(data.get("costPrice")),
    sellingPrice: Number(data.get("sellingPrice")),
    stockQuantity: Number(data.get("stockQuantity")),
    isMinibarItem: data.get("isMinibarItem") === "on",
  };
}

export function ProductBoard({ products }: { products: MenuProduct[] }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [removing, setRemoving] = useState<MenuProduct | null>(null);
  const [deletePin, setDeletePin] = useState("");

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    after?: () => void,
  ) {
    setFormError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setFormError(result.error);
        notify(false, success, result.error);
        return;
      }
      notify(true, success);
      after?.();
      // revalidatePath in the action already refreshes — skip dual fetch lag.
    });
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Thêm món</CardTitle>
          <CardDescription>Đồ ăn, đồ uống hoặc dịch vụ. Bật tủ minibar nếu món được kê sẵn trong phòng.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const input = readProduct(new FormData(form));
              run(() => createProduct(input), "Đã thêm món", () => form.reset());
            }}
          >
            <ProductFields idPrefix="create" />
            {formError && !editing && !removing ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? "Đang lưu" : "Lưu món"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thực đơn</CardTitle>
          <CardDescription>{products.length} món</CardDescription>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có món.</p>
          ) : (
            <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hiển thị / Nội bộ</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead className="text-right">Giá bán</TableHead>
                  <TableHead className="text-right">Tồn</TableHead>
                  <TableHead>Tủ minibar</TableHead>
                  <TableHead>Sửa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <p className="font-medium">{product.displayName || product.name}</p>
                      {product.displayName && product.displayName !== product.name ? (
                        <p className="text-xs text-muted-foreground">{product.name}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{labelCategory(product.category)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(product.sellingPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {product.category === "SERVICE"
                        ? "—"
                        : product.stock === 0
                          ? "Hết · 0"
                          : product.stock}
                    </TableCell>
                    <TableCell>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={product.isMinibar}
                          disabled={pending}
                          aria-label={`Tủ minibar cho ${product.name}`}
                          className="size-5 cursor-pointer accent-current"
                          onChange={(event) =>
                            run(
                              () => setMinibarItem(product.id, event.target.checked),
                              event.target.checked ? "Đã bật minibar" : "Đã tắt minibar",
                            )
                          }
                        />
                        {product.isMinibar ? "Có" : "Không"}
                      </label>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={pending}
                          onClick={() => {
                            setFormError(null);
                            setEditing(product);
                          }}
                        >
                          Sửa
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="min-h-11"
                          disabled={pending}
                          onClick={() => {
                            setFormError(null);
                            setRemoving(product);
                          }}
                        >
                          Xóa
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-full overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa {editing?.name}</DialogTitle>
            <DialogDescription>Giá mới chỉ áp dụng cho món gọi sau lần sửa này.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              key={editing.id}
              className="flex w-full flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const id = editing.id;
                const input = readProduct(new FormData(event.currentTarget));
                run(() => updateProduct(id, input), "Đã cập nhật món", () => setEditing(null));
              }}
            >
              <ProductFields idPrefix="edit" product={editing} />
              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(null)}>
                  Hủy
                </Button>
                <Button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? "Đang lưu" : "Lưu"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setDeletePin("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa {removing?.name}?</DialogTitle>
            <DialogDescription>
              Cần mã PIN quản lý. Món đang trên hóa đơn hoặc tủ minibar sẽ không xóa được.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="PIN quản lý"
            value={deletePin}
            onChange={(event) => setDeletePin(event.target.value)}
            className="min-h-12 text-center text-xl font-bold tracking-[0.3em]"
          />
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setRemoving(null);
                setDeletePin("");
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending || !removing || !deletePin.trim()}
              onClick={() => {
                if (!removing) return;
                const pin = deletePin.trim();
                run(
                  () => deleteProduct(removing.id, pin),
                  "Đã xóa món",
                  () => {
                    setRemoving(null);
                    setDeletePin("");
                  },
                );
              }}
            >
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
