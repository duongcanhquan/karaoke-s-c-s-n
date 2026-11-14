import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PosKiosk, type PosBill } from "@/components/pos/pos-kiosk";
import { staffCustomerCharge } from "@/lib/billing";
import type { InvoiceItem, Product, Room, RoomStatus, StaffBooking, StaffOption } from "@/lib/pos-types";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { createClient } from "@/utils/supabase/server";

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

async function PosContent() {
  await connection();
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/");

  const supabase = await createClient();
  const [roomsResult, productsResult, staffResult, invoiceResult] = await Promise.all([
    supabase.from("rooms").select("id, name, type, hourly_rate, status").order("name"),
    supabase.from("products").select("id, name, category, selling_price, is_minibar_item").order("name"),
    supabase.from("users").select("id, name, role").order("name"),
    supabase
      .from("invoices")
      .select("id, room_id, start_time, service_total")
      .eq("status", "ACTIVE"),
  ]);

  const loadError =
    roomsResult.error?.message ??
    productsResult.error?.message ??
    staffResult.error?.message ??
    invoiceResult.error?.message;

  if (loadError) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center p-6">
        <p role="alert" className="max-w-lg text-xl text-destructive">{loadError}</p>
      </div>
    );
  }

  const invoices = invoiceResult.data ?? [];
  const invoiceIds = invoices.map((invoice) => String(invoice.id));
  const [itemsResult, bookingsResult] = invoiceIds.length
    ? await Promise.all([
        supabase
          .from("invoice_items")
          .select("id, invoice_id, product_id, initial_qty, ordered_qty, remaining_qty, consumed_qty, price, products(name, is_minibar_item)")
          .in("invoice_id", invoiceIds),
        supabase
          .from("invoice_staff_bookings")
          .select("id, invoice_id, staff_id, hours_worked, customer_rate, staff_payout_rate, profit, users(name)")
          .in("invoice_id", invoiceIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const detailError = itemsResult.error ?? bookingsResult.error;
  if (detailError) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center p-6">
        <p role="alert" className="max-w-lg text-xl text-destructive">{detailError.message}</p>
      </div>
    );
  }

  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const item of itemsResult.data ?? []) {
    const invoiceId = String(item.invoice_id);
    const list = itemsByInvoice.get(invoiceId) ?? [];
    list.push({
      id: String(item.id),
      product_id: String(item.product_id),
      name: relatedName(item.products, "Món"),
      is_minibar_item: relatedFlag(item.products, "is_minibar_item"),
      initial_qty: asNumber(item.initial_qty),
      ordered_qty: asNumber(item.ordered_qty),
      remaining_qty: asNumber(item.remaining_qty),
      consumed_qty: asNumber(item.consumed_qty),
      price: asNumber(item.price),
    });
    itemsByInvoice.set(invoiceId, list);
  }

  const bookingsByInvoice = new Map<string, StaffBooking[]>();
  for (const booking of bookingsResult.data ?? []) {
    const invoiceId = String(booking.invoice_id);
    const list = bookingsByInvoice.get(invoiceId) ?? [];
    list.push({
      id: String(booking.id),
      staff_id: String(booking.staff_id),
      staff_name: relatedName(booking.users, "Nhân viên"),
      hours_worked: asNumber(booking.hours_worked),
      customer_rate: asNumber(booking.customer_rate),
      staff_payout_rate: asNumber(booking.staff_payout_rate),
      profit: asNumber(booking.profit),
    });
    bookingsByInvoice.set(invoiceId, list);
  }

  const bills: Record<string, PosBill> = {};
  for (const invoice of invoices) {
    const id = String(invoice.id);
    const bookings = bookingsByInvoice.get(id) ?? [];
    bills[String(invoice.room_id)] = {
      id,
      startTime: String(invoice.start_time),
      serviceTotal: asNumber(invoice.service_total),
      staffTotal: bookings.reduce(
        (sum, booking) => sum + staffCustomerCharge(booking.hours_worked, booking.customer_rate),
        0,
      ),
      items: itemsByInvoice.get(id) ?? [],
      bookings,
    };
  }

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

  return (
    <PosKiosk
      cashierName={session.name}
      rooms={rooms}
      products={products}
      staff={staff}
      bills={bills}
    />
  );
}

export default function PosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh w-screen items-center justify-center" aria-busy="true">
          <p className="text-xl">Đang tải quầy</p>
        </div>
      }
    >
      <PosContent />
    </Suspense>
  );
}
