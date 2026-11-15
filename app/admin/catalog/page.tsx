import { Suspense } from "react";
import { CatalogTabs } from "@/components/admin/catalog-tabs";
import { InventoryBoard } from "@/components/admin/inventory-board";
import { ProductBoard } from "@/components/admin/product-board";
import { LoadError } from "@/components/load-error";
import { getCachedInventoryData, getCachedMenuProducts } from "@/lib/admin-data";

const menuHint =
  "Chạy supabase_schema.sql, rồi update_schema.sql, trong SQL Editor của Supabase.";

function PanelFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
      <p className="sr-only">Đang tải</p>
    </div>
  );
}

async function MenuPanel() {
  const { products, error } = await getCachedMenuProducts();
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError message={error} hint={menuHint} />
        <ProductBoard products={[]} />
      </div>
    );
  }
  return <ProductBoard products={products} />;
}

async function InventoryPanel() {
  const data = await getCachedInventoryData();
  if (data.productsError) {
    return (
      <LoadError
        message={data.productsError}
        hint="Chạy supabase_schema.sql, rồi update_inventory_units.sql trong Supabase."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {data.movementsError ? (
        <LoadError
          message={data.movementsError}
          hint="Chạy update_inventory_movements.sql trong Supabase SQL Editor."
        />
      ) : null}
      {data.unitsError ? (
        <LoadError
          message={`Đơn vị tùy chỉnh: ${data.unitsError}`}
          hint="Chạy update_inventory_units.sql để thêm bảng đơn vị."
        />
      ) : null}
      <InventoryBoard
        products={data.products}
        movements={data.movements}
        units={data.units}
      />
    </div>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const active = params.tab === "inventory" ? "inventory" : "menu";

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hàng hóa</h1>
        <p className="text-sm text-muted-foreground">
          Thực đơn bán ra và nhập kho / kiểm kê trên cùng một màn hình.
        </p>
      </div>
      <CatalogTabs
        active={active}
        menuPanel={
          active === "menu" ? (
            <Suspense fallback={<PanelFallback />}>
              <MenuPanel />
            </Suspense>
          ) : null
        }
        inventoryPanel={
          active === "inventory" ? (
            <Suspense fallback={<PanelFallback />}>
              <InventoryPanel />
            </Suspense>
          ) : null
        }
      />
    </section>
  );
}
