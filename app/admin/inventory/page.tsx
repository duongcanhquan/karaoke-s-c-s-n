import { Suspense } from "react";
import { LoadError } from "@/components/load-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { labelCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/money";
import { createClient } from "@/utils/supabase/server";

function InventoryFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
      <p className="sr-only">Đang tải kho</p>
    </div>
  );
}

async function InventoryTable() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, cost_price, selling_price, stock_quantity, is_minibar_item")
    .order("category")
    .order("name");

  if (error) {
    return (
      <LoadError
        message={error.message}
        hint="Chạy supabase_schema.sql, rồi update_schema.sql, trong SQL Editor của Supabase."
      />
    );
  }

  const products = (data ?? []).map((product) => ({
    id: String(product.id),
    name: String(product.name),
    category: String(product.category),
    costPrice: Number(product.cost_price),
    sellingPrice: Number(product.selling_price),
    stock: Number(product.stock_quantity),
    minibar: Boolean(product.is_minibar_item),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tồn kho</CardTitle>
        <CardDescription>
          Tồn giảm theo số đã dùng khi hóa đơn đã thanh toán. Món dịch vụ không trừ kho.
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
                    {product.stock === 0 ? "Hết · 0" : product.stock}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InventoryPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kho hàng</h1>
        <p className="text-sm text-muted-foreground">Danh sách món và số lượng đang còn.</p>
      </div>
      <Suspense fallback={<InventoryFallback />}>
        <InventoryTable />
      </Suspense>
    </section>
  );
}
