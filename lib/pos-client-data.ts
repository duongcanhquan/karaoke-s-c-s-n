import { createClient } from "@/utils/supabase/client";
import { staffCustomerCharge } from "@/lib/billing";
import {
  EMPTY_SHOP_SETTINGS,
  type ShopCheckoutSettings,
} from "@/lib/checkout-preview";
import { displayLabel, relatedDisplayName } from "@/lib/display-name";
import { isMissingDisplayNameError, looseRows } from "@/lib/supabase-errors";
import type {
  InvoiceItem,
  Product,
  Room,
  RoomSetupItem,
  RoomStatus,
  StaffBooking,
  StaffOption,
} from "@/lib/pos-types";
import type { PosBill } from "@/components/pos/pos-kiosk";

export type PosSnapshot = {
  rooms: Room[];
  products: Product[];
  staff: StaffOption[];
  bills: Record<string, PosBill>;
  roomSetups: Record<string, RoomSetupItem[]>;
  shopSettings: ShopCheckoutSettings;
  fetchedAt: number;
};

const TTL_MS = 45_000;
let memory: PosSnapshot | null = null;
let inflight: Promise<PosSnapshot> | null = null;

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function relatedFlag(value: unknown, key: string) {
  const source = Array.isArray(value) ? value[0] : value;
  if (!source || typeof source !== "object" || !(key in source)) return false;
  return Boolean((source as Record<string, unknown>)[key]);
}

export function invalidatePosClientCache() {
  memory = null;
}

async function fetchPosSnapshot(): Promise<PosSnapshot> {
  const supabase = createClient();

  const roomsPromise = supabase
    .from("rooms")
    .select("id, name, type, hourly_rate, status")
    .order("name");
  const invoicesPromise = supabase
    .from("invoices")
    .select("id, room_id, start_time, service_total")
    .eq("status", "ACTIVE");
  const productsPromise = supabase
    .from("products")
    .select("id, name, display_name, category, selling_price, is_minibar_item")
    .order("name");
  const setupPromise = supabase
    .from("room_minibar_setup")
    .select("room_id, product_id, default_quantity, products(name, display_name)");
  const staffPromise = supabase
    .from("users")
    .select("id, name, display_name, role, customer_rate, staff_payout_rate")
    .eq("role", "SERVICE_STAFF")
    .order("name");
  const settingsPromise = supabase
    .from("shop_settings")
    .select(
      "bank_bin, bank_account_number, bank_account_name, shop_name, shop_address, shop_phone, receipt_footer, printer_paper_mm, printer_auto_print, printer_copies, printer_name",
    )
    .order("id")
    .limit(1)
    .maybeSingle();

  const [roomsResult, invoiceResult, productsRaw, setupRaw, staffRaw, settingsRaw] =
    await Promise.all([
      roomsPromise,
      invoicesPromise,
      productsPromise,
      setupPromise,
      staffPromise,
      settingsPromise,
    ]);

  let staffResult = looseRows(staffRaw);
  if (staffResult.error && isMissingDisplayNameError(staffResult.error.message)) {
    staffResult = looseRows(
      await supabase
        .from("users")
        .select("id, name, role, customer_rate, staff_payout_rate")
        .eq("role", "SERVICE_STAFF")
        .order("name"),
    );
  }
  if (
    staffResult.error &&
    (staffResult.error.message.toLowerCase().includes("customer_rate") ||
      staffResult.error.message.toLowerCase().includes("staff_payout"))
  ) {
    staffResult = looseRows(
      await supabase
        .from("users")
        .select("id, name, role")
        .eq("role", "SERVICE_STAFF")
        .order("name"),
    );
  }

  let productsResult = looseRows(productsRaw);
  let setupResult = looseRows(setupRaw);

  if (productsResult.error && isMissingDisplayNameError(productsResult.error.message)) {
    productsResult = looseRows(
      await supabase
        .from("products")
        .select("id, name, category, selling_price, is_minibar_item")
        .order("name"),
    );
  }
  if (setupResult.error && isMissingDisplayNameError(setupResult.error.message)) {
    setupResult = looseRows(
      await supabase
        .from("room_minibar_setup")
        .select("room_id, product_id, default_quantity, products(name)"),
    );
  }

  // Chỉ fail cứng khi không đọc được phòng — các phần khác soft-fail để quầy không trống hết.
  if (roomsResult.error) {
    throw new Error(roomsResult.error.message);
  }
  if (productsResult.error) productsResult = { data: [], error: null };
  if (setupResult.error) setupResult = { data: [], error: null };
  if (staffResult.error) staffResult = { data: [], error: null };

  const invoices = invoiceResult.error ? [] : (invoiceResult.data ?? []);
  const invoiceIds = invoices.map((invoice) => String(invoice.id));

  let itemsResult: { data: unknown[] | null; error: { message: string } | null } = {
    data: [],
    error: null,
  };
  let bookingsResult: { data: unknown[] | null; error: { message: string } | null } = {
    data: [],
    error: null,
  };

  if (invoiceIds.length) {
    const [itemsFull, bookingsFull] = await Promise.all([
      supabase
        .from("invoice_items")
        .select(
          "id, invoice_id, product_id, initial_qty, ordered_qty, remaining_qty, consumed_qty, price, products(name, display_name, is_minibar_item)",
        )
        .in("invoice_id", invoiceIds),
      supabase
        .from("invoice_staff_bookings")
        .select(
          "id, invoice_id, staff_id, hours_worked, customer_rate, staff_payout_rate, profit, start_time, end_time, users(name, display_name)",
        )
        .in("invoice_id", invoiceIds),
    ]);

    itemsResult = looseRows(itemsFull);
    bookingsResult = looseRows(bookingsFull);

    if (itemsResult.error && isMissingDisplayNameError(itemsResult.error.message)) {
      itemsResult = looseRows(
        await supabase
          .from("invoice_items")
          .select(
            "id, invoice_id, product_id, initial_qty, ordered_qty, remaining_qty, consumed_qty, price, products(name, is_minibar_item)",
          )
          .in("invoice_id", invoiceIds),
      );
    }
    if (
      bookingsResult.error &&
      (bookingsResult.error.message.toLowerCase().includes("start_time") ||
        bookingsResult.error.message.toLowerCase().includes("end_time"))
    ) {
      bookingsResult = looseRows(
        await supabase
          .from("invoice_staff_bookings")
          .select(
            "id, invoice_id, staff_id, hours_worked, customer_rate, staff_payout_rate, profit, users(name, display_name)",
          )
          .in("invoice_id", invoiceIds),
      );
    }
    if (bookingsResult.error && isMissingDisplayNameError(bookingsResult.error.message)) {
      bookingsResult = looseRows(
        await supabase
          .from("invoice_staff_bookings")
          .select(
            "id, invoice_id, staff_id, hours_worked, customer_rate, staff_payout_rate, profit, users(name)",
          )
          .in("invoice_id", invoiceIds),
      );
    }
  }

  const detailError = itemsResult.error ?? bookingsResult.error;
  if (detailError) throw new Error(detailError.message);

  const itemsByInvoice = new Map<string, InvoiceItem[]>();
  for (const raw of itemsResult.data ?? []) {
    const item = raw as Record<string, unknown>;
    const invoiceId = String(item.invoice_id);
    const list = itemsByInvoice.get(invoiceId) ?? [];
    list.push({
      id: String(item.id),
      product_id: String(item.product_id),
      name: relatedDisplayName(item.products, "Món"),
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
  for (const raw of bookingsResult.data ?? []) {
    const booking = raw as Record<string, unknown>;
    const invoiceId = String(booking.invoice_id);
    const list = bookingsByInvoice.get(invoiceId) ?? [];
    list.push({
      id: String(booking.id),
      staff_id: String(booking.staff_id),
      staff_name: relatedDisplayName(booking.users, "Phục vụ"),
      hours_worked: asNumber(booking.hours_worked),
      customer_rate: asNumber(booking.customer_rate),
      staff_payout_rate: asNumber(booking.staff_payout_rate),
      profit: asNumber(booking.profit),
      start_time: booking.start_time != null ? String(booking.start_time) : null,
      end_time: booking.end_time != null ? String(booking.end_time) : null,
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
        (sum, booking) =>
          sum + staffCustomerCharge(booking.hours_worked, booking.customer_rate),
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
    name: displayLabel(String(product.name), product.display_name as string | undefined),
    category: String(product.category),
    selling_price: asNumber(product.selling_price),
    is_minibar_item: Boolean(product.is_minibar_item),
  }));

  const roomSetups: Record<string, RoomSetupItem[]> = {};
  for (const setup of setupResult.data ?? []) {
    const roomId = String(setup.room_id);
    const list = roomSetups[roomId] ?? [];
    list.push({
      productId: String(setup.product_id),
      productName: relatedDisplayName(setup.products, "Món"),
      quantity: asNumber(setup.default_quantity),
    });
    roomSetups[roomId] = list;
  }
  for (const roomId of Object.keys(roomSetups)) {
    roomSetups[roomId].sort((a, b) => a.productName.localeCompare(b.productName, "vi"));
  }

  const staff: StaffOption[] = (staffResult.data ?? []).map((member) => {
    const name = String(member.name);
    return {
      id: String(member.id),
      name,
      displayName: displayLabel(name, member.display_name as string | undefined),
      role: String(member.role),
      customerRate: asNumber(member.customer_rate),
      staffPayoutRate: asNumber(member.staff_payout_rate),
    };
  });

  let shopSettings = EMPTY_SHOP_SETTINGS;
  if (!settingsRaw.error && settingsRaw.data) {
    const row = settingsRaw.data;
    const paper = Number(row.printer_paper_mm) === 58 ? 58 : 80;
    shopSettings = {
      bankBin: String(row.bank_bin ?? ""),
      bankAccountNumber: String(row.bank_account_number ?? ""),
      bankAccountName: String(row.bank_account_name ?? ""),
      shopName: String(row.shop_name ?? "Karaoke"),
      shopAddress: String(row.shop_address ?? ""),
      shopPhone: String(row.shop_phone ?? ""),
      receiptFooter: String(row.receipt_footer ?? "Cảm ơn quý khách"),
      printerPaperMm: paper,
      printerAutoPrint: Boolean(row.printer_auto_print),
      printerCopies: Math.min(3, Math.max(1, Number(row.printer_copies) || 1)),
      printerName: String(row.printer_name ?? ""),
    };
  } else if (settingsRaw.error) {
    const basic = await supabase
      .from("shop_settings")
      .select("bank_bin, bank_account_number, bank_account_name")
      .order("id")
      .limit(1)
      .maybeSingle();
    if (!basic.error && basic.data) {
      shopSettings = {
        ...EMPTY_SHOP_SETTINGS,
        bankBin: String(basic.data.bank_bin ?? ""),
        bankAccountNumber: String(basic.data.bank_account_number ?? ""),
        bankAccountName: String(basic.data.bank_account_name ?? ""),
      };
    }
  }

  return {
    rooms,
    products,
    staff,
    bills,
    roomSetups,
    shopSettings,
    fetchedAt: Date.now(),
  };
}

/** Warm in-memory cache — revisiting POS within TTL is instant. */
export async function loadPosSnapshot(force = false): Promise<PosSnapshot> {
  if (!force && memory && Date.now() - memory.fetchedAt < TTL_MS) {
    return memory;
  }
  if (!force && inflight) return inflight;

  inflight = fetchPosSnapshot()
    .then((snapshot) => {
      memory = snapshot;
      return snapshot;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
