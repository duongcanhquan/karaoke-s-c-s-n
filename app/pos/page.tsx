import { Suspense } from "react";
import { connection } from "next/server";
import { PosBoard } from "@/components/pos/pos-board";
import { createClient } from "@/utils/supabase/server";
import type {
  Invoice,
  InvoiceItem,
  Product,
  Room,
  RoomStatus,
  StaffBooking,
  StaffOption,
} from "@/lib/pos-types";

function PosFallback() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-live="polite">
      <p className="sr-only">Đang tải quầy</p>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-40 rounded-xl bg-muted motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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

function relatedFlag(value: unknown, key: string) {
  const source = Array.isArray(value) ? value[0] : value;
  if (!source || typeof source !== "object" || !(key in source)) return false;
  return Boolean((source as Record<string, unknown>)[key]);
}

async function PosContent({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  await connection();
  const { room: selectedRoomId } = await searchParams;
  const supabase = await createClient();
  const fetchedAt = new Date().toISOString();

  const [roomsResult, productsResult, staffResult] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, type, hourly_rate, status")
      .order("name"),
    supabase
      .from("products")
      .select("id, name, category, selling_price, is_minibar_item")
      .order("category")
      .order("name"),
    supabase.from("users").select("id, name, role").order("name"),
  ]);

  const loadError =
    roomsResult.error?.message ??
    productsResult.error?.message ??
    staffResult.error?.message ??
    null;
  const rooms: Room[] = (roomsResult.data ?? []).map((room) => ({
    id: String(room.id),
    name: String(room.name),
    type: String(room.type),
    hourly_rate: asNumber(room.hourly_rate),
    status: room.status as RoomStatus,
  }));
  const products: Product[] = (productsResult.data ?? []).map((product) => ({
    id: String(product.id),
    name: String(product.name),
    category: String(product.category),
    selling_price: asNumber(product.selling_price),
    is_minibar_item: Boolean(product.is_minibar_item),
  }));
  const staff: StaffOption[] = (staffResult.data ?? []).map((member) => ({
    id: String(member.id),
    name: String(member.name),
    role: String(member.role),
  }));

  let invoice: Invoice | null = null;
  let items: InvoiceItem[] = [];
  let bookings: StaffBooking[] = [];

  const selected = rooms.find((room) => room.id === selectedRoomId);
  if (!loadError && selected?.status === "IN_USE") {
    const invoiceResult = await supabase
      .from("invoices")
      .select("id, start_time, room_total, service_total, grand_total, status")
      .eq("room_id", selected.id)
      .eq("status", "ACTIVE")
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invoiceResult.error) {
      return (
        <PosBoard
          rooms={rooms}
          products={products}
          staff={staff}
          selectedRoomId={selected.id}
          invoice={null}
          items={[]}
          bookings={[]}
          loadError={invoiceResult.error.message}
          fetchedAt={fetchedAt}
        />
      );
    }

    if (invoiceResult.data) {
      invoice = {
        id: String(invoiceResult.data.id),
        start_time: String(invoiceResult.data.start_time),
        room_total: asNumber(invoiceResult.data.room_total),
        service_total: asNumber(invoiceResult.data.service_total),
        grand_total: asNumber(invoiceResult.data.grand_total),
        status: "ACTIVE",
      };

      const [itemsResult, bookingsResult] = await Promise.all([
        supabase
          .from("invoice_items")
          .select(
            "id, product_id, initial_qty, ordered_qty, remaining_qty, consumed_qty, price, products(name, is_minibar_item)",
          )
          .eq("invoice_id", invoice.id),
        supabase
          .from("invoice_staff_bookings")
          .select("id, staff_id, hours_worked, customer_rate, staff_payout_rate, profit, users(name)")
          .eq("invoice_id", invoice.id),
      ]);

      const detailError = itemsResult.error ?? bookingsResult.error;
      if (detailError) {
        return (
          <PosBoard
            rooms={rooms}
            products={products}
            staff={staff}
            selectedRoomId={selected.id}
            invoice={invoice}
            items={[]}
            bookings={[]}
            loadError={detailError.message}
            fetchedAt={fetchedAt}
          />
        );
      }

      items = (itemsResult.data ?? []).map((item) => ({
        id: String(item.id),
        product_id: String(item.product_id),
        name: relatedName(item.products, "Món"),
        is_minibar_item: relatedFlag(item.products, "is_minibar_item"),
        initial_qty: asNumber(item.initial_qty),
        ordered_qty: asNumber(item.ordered_qty),
        remaining_qty: asNumber(item.remaining_qty),
        consumed_qty: asNumber(item.consumed_qty),
        price: asNumber(item.price),
      }));
      bookings = (bookingsResult.data ?? []).map((booking) => ({
        id: String(booking.id),
        staff_id: String(booking.staff_id),
        staff_name: relatedName(booking.users, "Nhân viên"),
        hours_worked: asNumber(booking.hours_worked),
        customer_rate: asNumber(booking.customer_rate),
        staff_payout_rate: asNumber(booking.staff_payout_rate),
        profit: asNumber(booking.profit),
      }));
    }
  }

  return (
    <PosBoard
      rooms={rooms}
      products={products}
      staff={staff}
      selectedRoomId={selected?.id ?? null}
      invoice={invoice}
      items={items}
      bookings={bookings}
      loadError={loadError}
      fetchedAt={fetchedAt}
    />
  );
}

export default function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  return (
    <Suspense fallback={<PosFallback />}>
      <PosContent searchParams={searchParams} />
    </Suspense>
  );
}
