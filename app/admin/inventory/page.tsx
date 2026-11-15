import { Suspense } from "react";
import {
  InventoryBoard,
  type InventoryMovement,
  type InventoryProduct,
} from "@/components/admin/inventory-board";
import { LoadError } from "@/components/load-error";
import { createClient } from "@/utils/supabase/server";

function InventoryFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
      <p className="sr-only">Đang tải kho</p>
    </div>
  );
}

function relatedName(value: unknown, fallback: string) {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    const first = value[0] as { name?: string } | undefined;
    return first?.name ?? fallback;
  }
  if (typeof value === "object" && value && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return fallback;
}

async function InventoryContent() {
  const supabase = await createClient();
  const [productsResult, movementsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, cost_price, selling_price, stock_quantity, is_minibar_item")
      .order("category")
      .order("name"),
    supabase
      .from("stock_movements")
      .select("id, movement_type, quantity_before, quantity_delta, quantity_after, note, created_at, products(name)")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (productsResult.error) {
    return (
      <LoadError
        message={productsResult.error.message}
        hint="Chạy supabase_schema.sql, rồi update_schema.sql, trong SQL Editor của Supabase."
      />
    );
  }

  const products: InventoryProduct[] = (productsResult.data ?? []).map((product) => ({
    id: String(product.id),
    name: String(product.name),
    category: String(product.category),
    costPrice: Number(product.cost_price),
    sellingPrice: Number(product.selling_price),
    stock: Number(product.stock_quantity),
    minibar: Boolean(product.is_minibar_item),
  }));

  let movements: InventoryMovement[] = [];
  if (!movementsResult.error) {
    movements = (movementsResult.data ?? []).map((move) => ({
      id: String(move.id),
      productName: relatedName(move.products, "Món"),
      type: String(move.movement_type),
      before: Number(move.quantity_before),
      delta: Number(move.quantity_delta),
      after: Number(move.quantity_after),
      note: String(move.note ?? ""),
      createdAt: String(move.created_at),
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      {movementsResult.error ? (
        <LoadError
          message={movementsResult.error.message}
          hint="Chạy update_inventory_movements.sql trong Supabase SQL Editor để mở sổ nhập/kiểm kê."
        />
      ) : null}
      <InventoryBoard products={products} movements={movements} />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kho hàng</h1>
        <p className="text-sm text-muted-foreground">
          Nhập kho, kiểm kê đúng số đếm, xem tồn. Thanh toán vẫn trừ kho tự động — không đụng nhầm.
        </p>
      </div>
      <Suspense fallback={<InventoryFallback />}>
        <InventoryContent />
      </Suspense>
    </section>
  );
}
