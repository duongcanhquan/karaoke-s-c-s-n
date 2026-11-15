import { Suspense } from "react";
import { CatalogTabs } from "@/components/admin/catalog-tabs";
import { InventoryBoard } from "@/components/admin/inventory-board";
import { PanelLoading } from "@/components/admin/panel-loading";
import { ProductBoard } from "@/components/admin/product-board";
import { LoadError } from "@/components/load-error";
import { getCachedInventoryData, getCachedMenuProducts } from "@/lib/admin-data";

const menuHint =
  "Chạy supabase_schema.sql, rồi update_schema.sql, trong SQL Editor của Supabase.";

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

async function InventoryPanel({ inv }: { inv?: string }) {
  const data = await getCachedInventoryData();
  const initialTab =
    inv === "stocktake" || inv === "audit"
      ? "stocktake"
      : inv === "catalog" || inv === "units" || inv === "ledger"
        ? inv
        : "receive";
  return (
    <div className="flex flex-col gap-4">
      {data.productsError ? (
        <LoadError
          message={data.productsError}
          hint="Chạy supabase_schema.sql, rồi update_inventory_units.sql trong Supabase."
        />
      ) : null}
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
        initialTab={initialTab}
      />
    </div>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; inv?: string }>;
}) {
  const params = await searchParams;
  const active = params.tab === "inventory" ? "inventory" : "menu";

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hàng hóa</h1>
      </div>
      <CatalogTabs
        active={active}
        menuPanel={
          <Suspense fallback={<PanelLoading label="Đang tải thực đơn…" />}>
            <MenuPanel />
          </Suspense>
        }
        inventoryPanel={
          <Suspense fallback={<PanelLoading label="Đang tải kho hàng…" />}>
            <InventoryPanel inv={params.inv} />
          </Suspense>
        }
      />
    </section>
  );
}
