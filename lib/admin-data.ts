import { cacheLife, cacheTag } from "next/cache";
import { isProductCategory } from "@/lib/catalog";
import type { MenuProduct } from "@/components/admin/product-board";
import type { AdminRoom } from "@/components/admin/room-board";
import type {
  MinibarProduct,
  MinibarRoom,
  MinibarSetup,
} from "@/components/admin/minibar-board";
import type {
  InventoryMovement,
  InventoryProduct,
  InventoryUnit,
} from "@/components/admin/inventory-board";
import { displayLabel, relatedDisplayName } from "@/lib/display-name";
import { defaultInventoryUnits } from "@/lib/inventory-meta";
import { isMissingDisplayNameError, looseRows } from "@/lib/supabase-errors";
import { createDb } from "@/utils/supabase/db";

export async function getCachedMenuProducts(): Promise<{
  products: MenuProduct[];
  error: string | null;
}> {
  "use cache";
  cacheTag("products");
  cacheLife("minutes");

  const supabase = createDb();
  let { data, error } = await supabase
    .from("products")
    .select(
      "id, name, display_name, category, cost_price, selling_price, stock_quantity, is_minibar_item",
    )
    .order("category")
    .order("name");

  if (error) {
    const basic = await supabase
      .from("products")
      .select("id, name, category, cost_price, selling_price, stock_quantity, is_minibar_item")
      .order("category")
      .order("name");
    if (basic.error) return { products: [], error: basic.error.message };
    data = (basic.data ?? []).map((product) => ({ ...product, display_name: product.name }));
    error = null;
  }

  const products: MenuProduct[] = (data ?? []).flatMap((product) => {
    const category = String(product.category);
    if (!isProductCategory(category)) return [];
    const name = String(product.name);
    return [
      {
        id: String(product.id),
        name,
        displayName: displayLabel(name, (product as { display_name?: string }).display_name),
        category,
        costPrice: Number(product.cost_price),
        sellingPrice: Number(product.selling_price),
        stock: Number(product.stock_quantity),
        isMinibar: Boolean(product.is_minibar_item),
      },
    ];
  });

  return { products, error: null };
}

export async function getCachedSetupData(): Promise<{
  rooms: AdminRoom[];
  minibarRooms: MinibarRoom[];
  products: MinibarProduct[];
  setups: MinibarSetup[];
  roomsError: string | null;
  productsError: string | null;
  setupsError: string | null;
  minibarError: string | null;
}> {
  "use cache";
  cacheTag("rooms");
  cacheTag("products");
  cacheTag("minibar");
  cacheLife("minutes");

  const supabase = createDb();
  const [roomsResult, productsRaw, setupRaw] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, type, hourly_rate, status")
      .order("name"),
    supabase
      .from("products")
      .select("id, name, display_name")
      .eq("is_minibar_item", true)
      .order("name"),
    supabase
      .from("room_minibar_setup")
      .select("id, default_quantity, rooms(name), products(name, display_name)"),
  ]);

  let productsResult = looseRows(productsRaw);
  let setupResult = looseRows(setupRaw);

  if (isMissingDisplayNameError(productsResult.error?.message)) {
    productsResult = looseRows(
      await supabase
        .from("products")
        .select("id, name")
        .eq("is_minibar_item", true)
        .order("name"),
    );
  }
  if (isMissingDisplayNameError(setupResult.error?.message)) {
    setupResult = looseRows(
      await supabase
        .from("room_minibar_setup")
        .select("id, default_quantity, rooms(name), products(name)"),
    );
  }

  const rooms: AdminRoom[] = (roomsResult.data ?? []).map((room) => ({
    id: String(room.id),
    name: String(room.name),
    type: String(room.type),
    hourlyRate: Number(room.hourly_rate),
    status: String(room.status),
  }));

  const minibarRooms: MinibarRoom[] = rooms.map((room) => ({
    id: room.id,
    name: room.name,
  }));

  const products: MinibarProduct[] = (productsResult.data ?? []).map((product) => ({
    id: String(product.id),
    name: displayLabel(String(product.name), product.display_name as string | undefined),
  }));

  const setups: MinibarSetup[] = (setupResult.data ?? [])
    .map((setup) => ({
      id: String(setup.id),
      roomName: relatedDisplayName(setup.rooms, "Phòng"),
      productName: relatedDisplayName(setup.products, "Món"),
      defaultQuantity: Number(setup.default_quantity),
    }))
    .sort(
      (a, b) =>
        a.roomName.localeCompare(b.roomName, "vi") ||
        a.productName.localeCompare(b.productName, "vi"),
    );

  return {
    rooms: roomsResult.error ? [] : rooms,
    minibarRooms: roomsResult.error ? [] : minibarRooms,
    products: productsResult.error ? [] : products,
    setups: setupResult.error ? [] : setups,
    roomsError: roomsResult.error?.message ?? null,
    productsError: productsResult.error?.message ?? null,
    setupsError: setupResult.error?.message ?? null,
    // Giữ alias cũ cho caller chưa tách lỗi.
    minibarError:
      productsResult.error?.message ?? setupResult.error?.message ?? null,
  };
}

export async function getCachedInventoryData(): Promise<{
  products: InventoryProduct[];
  movements: InventoryMovement[];
  units: InventoryUnit[];
  productsError: string | null;
  movementsError: string | null;
  unitsError: string | null;
}> {
  "use cache";
  cacheTag("products");
  cacheTag("inventory");
  cacheLife("minutes");

  const supabase = createDb();
  const [productsResult, movementsRaw, unitsResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, category, cost_price, selling_price, stock_quantity, is_minibar_item, unit, pack_unit, units_per_pack, stock_kind",
      )
      .order("category")
      .order("name"),
    supabase
      .from("stock_movements")
      .select(
        "id, movement_type, quantity_before, quantity_delta, quantity_after, note, created_at, products(name, display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("inventory_units").select("id, name").order("sort_order").order("name"),
  ]);

  let movementsQuery = looseRows(movementsRaw);
  if (isMissingDisplayNameError(movementsQuery.error?.message)) {
    movementsQuery = looseRows(
      await supabase
        .from("stock_movements")
        .select(
          "id, movement_type, quantity_before, quantity_delta, quantity_after, note, created_at, products(name)",
        )
        .order("created_at", { ascending: false })
        .limit(40),
    );
  }

  let productsRaw = productsResult.data;
  let productsError = productsResult.error?.message ?? null;

  if (productsError) {
    const basic = await supabase
      .from("products")
      .select("id, name, category, cost_price, selling_price, stock_quantity, is_minibar_item")
      .order("category")
      .order("name");
    if (!basic.error) {
      productsRaw = (basic.data ?? []).map((product) => ({
        ...product,
        unit: "cái",
        pack_unit: "thùng",
        units_per_pack: 1,
        stock_kind: "CONSUMABLE",
      }));
      productsError = null;
    }
  }

  const products: InventoryProduct[] = (productsRaw ?? []).map((product) => ({
    id: String(product.id),
    name: String(product.name),
    category: String(product.category),
    costPrice: Number(product.cost_price),
    sellingPrice: Number(product.selling_price),
    stock: Number(product.stock_quantity),
    minibar: Boolean(product.is_minibar_item),
    unit: String(product.unit ?? "cái"),
    packUnit: String(product.pack_unit ?? "thùng"),
    unitsPerPack: Math.max(1, Number(product.units_per_pack) || 1),
    stockKind: String(product.stock_kind ?? "CONSUMABLE"),
  }));

  const movements: InventoryMovement[] = !movementsQuery.error
    ? (movementsQuery.data ?? []).map((move) => ({
        id: String(move.id),
        productName: relatedDisplayName(move.products, "Món"),
        type: String(move.movement_type),
        before: Number(move.quantity_before),
        delta: Number(move.quantity_delta),
        after: Number(move.quantity_after),
        note: String(move.note ?? ""),
        createdAt: String(move.created_at),
      }))
    : [];

  let units: InventoryUnit[] = !unitsResult.error
    ? (unitsResult.data ?? []).map((unit) => ({
        id: String(unit.id),
        name: String(unit.name),
      }))
    : [];

  if (units.length === 0) {
    units = defaultInventoryUnits.map((name, index) => ({
      id: `default-${index}`,
      name,
    }));
  }

  return {
    products,
    movements,
    units,
    productsError,
    movementsError: movementsQuery.error?.message ?? null,
    unitsError: unitsResult.error?.message ?? null,
  };
}

export async function getCachedDashboardStats(): Promise<{
  inUse: number;
  openInvoices: number;
  productCount: number;
  error: string | null;
}> {
  "use cache";
  cacheTag("rooms");
  cacheTag("products");
  cacheTag("pos");
  cacheLife("seconds");

  const supabase = createDb();
  const [rooms, invoices, products] = await Promise.all([
    supabase.from("rooms").select("id, status"),
    supabase.from("invoices").select("id").eq("status", "ACTIVE"),
    supabase.from("products").select("id"),
  ]);

  const error = rooms.error ?? invoices.error ?? products.error;
  if (error) {
    return { inUse: 0, openInvoices: 0, productCount: 0, error: error.message };
  }

  return {
    inUse: (rooms.data ?? []).filter((room) => room.status === "IN_USE").length,
    openInvoices: invoices.data?.length ?? 0,
    productCount: products.data?.length ?? 0,
    error: null,
  };
}
