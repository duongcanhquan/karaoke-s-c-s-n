import { Suspense } from "react";
import { ProductBoard, type MenuProduct } from "@/components/admin/product-board";
import { LoadError } from "@/components/load-error";
import { isProductCategory } from "@/lib/catalog";
import { createClient } from "@/utils/supabase/server";

const hint =
  "Chạy supabase_schema.sql, rồi update_schema.sql, trong SQL Editor của Supabase.";

function ProductsFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
      <p className="sr-only">Đang tải thực đơn</p>
    </div>
  );
}

async function ProductsContent() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, cost_price, selling_price, stock_quantity, is_minibar_item")
    .order("category")
    .order("name");

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError message={error.message} hint={hint} />
        <ProductBoard products={[]} />
      </div>
    );
  }

  const products: MenuProduct[] = (data ?? []).flatMap((product) => {
    const category = String(product.category);
    if (!isProductCategory(category)) return [];
    return [
      {
        id: String(product.id),
        name: String(product.name),
        category,
        costPrice: Number(product.cost_price),
        sellingPrice: Number(product.selling_price),
        stock: Number(product.stock_quantity),
        isMinibar: Boolean(product.is_minibar_item),
      },
    ];
  });

  return <ProductBoard products={products} />;
}

export default function AdminProductsPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
        <p className="text-sm text-muted-foreground">
          Thêm, sửa, xóa món và đánh dấu món thuộc minibar.
        </p>
      </div>
      <Suspense fallback={<ProductsFallback />}>
        <ProductsContent />
      </Suspense>
    </section>
  );
}
