import { Suspense } from "react";
import {
  MinibarBoard,
  type MinibarProduct,
  type MinibarRoom,
  type MinibarSetup,
} from "@/components/admin/minibar-board";
import { LoadError } from "@/components/load-error";
import { createClient } from "@/utils/supabase/server";

const hint =
  "Chạy supabase_schema.sql, rồi update_schema.sql, trong SQL Editor của Supabase.";

function MinibarFallback() {
  return (
    <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true">
      <p className="sr-only">Đang tải minibar</p>
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

async function MinibarContent() {
  const supabase = await createClient();
  const [roomsResult, productsResult, setupResult] = await Promise.all([
    supabase.from("rooms").select("id, name").order("name"),
    supabase
      .from("products")
      .select("id, name")
      .eq("is_minibar_item", true)
      .order("name"),
    supabase
      .from("room_minibar_setup")
      .select("id, default_quantity, rooms(name), products(name)"),
  ]);

  const error = roomsResult.error ?? productsResult.error ?? setupResult.error;
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError message={error.message} hint={hint} />
        <MinibarBoard rooms={[]} products={[]} setups={[]} />
      </div>
    );
  }

  const rooms: MinibarRoom[] = (roomsResult.data ?? []).map((room) => ({
    id: String(room.id),
    name: String(room.name),
  }));
  const products: MinibarProduct[] = (productsResult.data ?? []).map((product) => ({
    id: String(product.id),
    name: String(product.name),
  }));
  const setups: MinibarSetup[] = (setupResult.data ?? [])
    .map((setup) => ({
      id: String(setup.id),
      roomName: relatedName(setup.rooms, "Phòng"),
      productName: relatedName(setup.products, "Món"),
      defaultQuantity: Number(setup.default_quantity),
    }))
    .sort((a, b) => a.roomName.localeCompare(b.roomName, "vi") || a.productName.localeCompare(b.productName, "vi"));

  return <MinibarBoard rooms={rooms} products={products} setups={setups} />;
}

export default function AdminMinibarPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tủ minibar</h1>
        <p className="text-sm text-muted-foreground">
          Gán món và số lượng sẵn trong từng phòng.
        </p>
      </div>
      <Suspense fallback={<MinibarFallback />}>
        <MinibarContent />
      </Suspense>
    </section>
  );
}
