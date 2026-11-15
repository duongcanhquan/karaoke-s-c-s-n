"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  availableQty,
  lineNeedsAudit,
  staffCustomerCharge,
} from "@/lib/billing";
import { checkAdminPin } from "@/lib/admin-pin";
import { billableHours, roundMoney } from "@/lib/money";
import type {
  ActionResult,
  ConfirmPaymentInput,
  PaidBillDetail,
  PaymentMethod,
  PeriodRevenue,
  PrepareCheckoutResult,
  ReceiptLine,
  RevenuePeriod,
  StockAuditLine,
} from "@/lib/pos-types";
import {
  formatVietnamDayLabel,
  formatVietnamDayLong,
  formatVietnamMonthLabel,
  formatVietnamMonthLong,
  formatVietnamWeekLabel,
  formatVietnamWeekLong,
  vietnamDayBounds,
  vietnamMonthBounds,
  vietnamWeekBounds,
} from "@/lib/vietnam-time";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function fail(error: { message: string } | null, fallback: string): ActionResult | null {
  if (!error) return null;
  return { ok: false, error: error.message || fallback };
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

function wholeNumber(value: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
  return value;
}

function refreshPos(paths: string[] = ["/pos"]) {
  // Only revalidate what the action actually changed — avoids extra Supabase reads on refresh.
  for (const path of paths) revalidatePath(path);
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return value === "CASH" || value === "QR" || value === "SPLIT";
}

async function activeInvoice(supabase: Supabase, invoiceId: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, room_id, room_total, start_time, status")
    .eq("id", invoiceId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  return { data, error };
}

export type StartedRoomItem = {
  id: string;
  productId: string;
  name: string;
  isMinibar: boolean;
  initialQty: number;
  orderedQty: number;
  remainingQty: number;
  price: number;
};

export async function startRoom(
  roomId: string,
): Promise<
  | {
      ok: true;
      roomId: string;
      invoiceId: string;
      startTime: string;
      items: StartedRoomItem[];
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: room, error } = await supabase
    .from("rooms")
    .update({ status: "IN_USE" })
    .eq("id", roomId)
    .eq("status", "AVAILABLE")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message || "Không mở được phòng." };
  if (!room) return { ok: false, error: "Phòng không còn trống." };

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      room_id: roomId,
      status: "ACTIVE",
      room_total: 0,
      service_total: 0,
      grand_total: 0,
    })
    .select("id, start_time")
    .single();

  if (invoiceError || !invoice) {
    await supabase.from("rooms").update({ status: "AVAILABLE" }).eq("id", roomId);
    return { ok: false, error: invoiceError?.message ?? "Không tạo được hóa đơn." };
  }

  const seeded = await seedMinibar(supabase, String(invoice.id), roomId);
  if (!seeded.ok) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    await supabase.from("rooms").update({ status: "AVAILABLE" }).eq("id", roomId);
    return seeded;
  }

  // No revalidatePath here — client already has optimistic state (avoids full POS reload lag).
  return {
    ok: true,
    roomId,
    invoiceId: String(invoice.id),
    startTime: String(invoice.start_time),
    items: seeded.items,
  };
}

async function seedMinibar(
  supabase: Supabase,
  invoiceId: string,
  roomId: string,
): Promise<{ ok: true; items: StartedRoomItem[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("room_minibar_setup")
    .select("product_id, default_quantity, products(name, selling_price, is_minibar_item)")
    .eq("room_id", roomId);

  if (error) return { ok: false, error: error.message || "Không đọc được minibar của phòng." };

  type SeedRow = {
    invoice_id: string;
    product_id: string;
    initial_qty: number;
    ordered_qty: number;
    remaining_qty: number;
    price: number;
    name: string;
    isMinibar: boolean;
  };

  const rows: SeedRow[] = [];
  for (const setup of data ?? []) {
    const quantity = Number(setup.default_quantity);
    const related = (Array.isArray(setup.products) ? setup.products[0] : setup.products) as
      | { name?: unknown; selling_price?: unknown; is_minibar_item?: unknown }
      | null
      | undefined;
    const price = Number(related?.selling_price);
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price)) continue;
    rows.push({
      invoice_id: invoiceId,
      product_id: String(setup.product_id),
      initial_qty: quantity,
      ordered_qty: 0,
      remaining_qty: quantity,
      price,
      name: String(related?.name ?? "Món"),
      isMinibar: Boolean(related?.is_minibar_item ?? true),
    });
  }

  if (rows.length === 0) return { ok: true, items: [] };

  const { data: inserted, error: insertError } = await supabase
    .from("invoice_items")
    .insert(
      rows.map((row) => ({
        invoice_id: row.invoice_id,
        product_id: row.product_id,
        initial_qty: row.initial_qty,
        ordered_qty: row.ordered_qty,
        remaining_qty: row.remaining_qty,
        price: row.price,
      })),
    )
    .select("id, product_id, initial_qty, ordered_qty, remaining_qty, price");
  if (insertError) {
    return { ok: false, error: insertError.message || "Không nạp được minibar vào hóa đơn." };
  }

  const meta = new Map(rows.map((row) => [row.product_id, row]));

  return {
    ok: true,
    items: (inserted ?? []).map((item) => {
      const info = meta.get(String(item.product_id));
      return {
        id: String(item.id),
        productId: String(item.product_id),
        name: info?.name ?? "Món",
        isMinibar: info?.isMinibar ?? true,
        initialQty: Number(item.initial_qty),
        orderedQty: Number(item.ordered_qty),
        remainingQty: Number(item.remaining_qty),
        price: Number(item.price),
      };
    }),
  };
}

export async function addInvoiceItem(
  invoiceId: string,
  productId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: invoice, error: invoiceError } = await activeInvoice(supabase, invoiceId);

  const invoiceFailure = fail(invoiceError, "Không đọc được hóa đơn.");
  if (invoiceFailure) return invoiceFailure;
  if (!invoice) return { ok: false, error: "Hóa đơn không còn mở." };

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, selling_price, is_minibar_item")
    .eq("id", productId)
    .maybeSingle();

  const productFailure = fail(productError, "Không đọc được món.");
  if (productFailure) return productFailure;
  if (!product) return { ok: false, error: "Không tìm thấy món." };

  const price = Number(product.selling_price);
  const minibar = Boolean(product.is_minibar_item);
  const { data: existing, error: existingError } = await supabase
    .from("invoice_items")
    .select("id, ordered_qty, remaining_qty")
    .eq("invoice_id", invoiceId)
    .eq("product_id", productId)
    .maybeSingle();

  const existingFailure = fail(existingError, "Không đọc được dòng hóa đơn.");
  if (existingFailure) return existingFailure;

  if (existing) {
    const ordered = Number(existing.ordered_qty) + 1;
    const remaining = minibar ? Number(existing.remaining_qty) + 1 : Number(existing.remaining_qty);
    const { error } = await supabase
      .from("invoice_items")
      .update({ ordered_qty: ordered, remaining_qty: remaining })
      .eq("id", existing.id);
    const updateFailure = fail(error, "Không thêm được món.");
    if (updateFailure) return updateFailure;
  } else {
    const { error } = await supabase.from("invoice_items").insert({
      invoice_id: invoiceId,
      product_id: productId,
      initial_qty: 0,
      ordered_qty: 1,
      remaining_qty: minibar ? 1 : 0,
      price,
    });
    const insertFailure = fail(error, "Không thêm được món.");
    if (insertFailure) return insertFailure;
  }

  return { ok: true };
}

async function requireAdminPin(pinCode: string | undefined) {
  const result = await checkAdminPin(pinCode);
  if (!result.ok) {
    return {
      ok: false as const,
      error:
        result.error === "Nhập mã PIN quản lý."
          ? "Nhập mã PIN quản lý để xóa món."
          : result.error,
    };
  }
  return { ok: true as const };
}

export async function verifyAdminPin(managerPin: string): Promise<ActionResult> {
  return checkAdminPin(managerPin);
}

export async function adjustInvoiceItem(
  invoiceId: string,
  productId: string,
  delta: number,
  managerPin?: string,
): Promise<ActionResult> {
  if (delta !== 1 && delta !== -1) return { ok: false, error: "Số lượng không hợp lệ." };

  const supabase = await createClient();
  if (delta < 0) {
    const admin = await requireAdminPin(managerPin);
    if (!admin.ok) return admin;
  }

  const { data: invoice, error: invoiceError } = await activeInvoice(supabase, invoiceId);
  const invoiceFailure = fail(invoiceError, "Không đọc được hóa đơn.");
  if (invoiceFailure) return invoiceFailure;
  if (!invoice) return { ok: false, error: "Hóa đơn không còn mở." };

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, selling_price, is_minibar_item")
    .eq("id", productId)
    .maybeSingle();
  const productFailure = fail(productError, "Không đọc được món.");
  if (productFailure) return productFailure;
  if (!product) return { ok: false, error: "Không tìm thấy món." };

  const minibar = Boolean(product.is_minibar_item);
  const { data: existing, error: existingError } = await supabase
    .from("invoice_items")
    .select("id, initial_qty, ordered_qty, remaining_qty")
    .eq("invoice_id", invoiceId)
    .eq("product_id", productId)
    .maybeSingle();
  const existingFailure = fail(existingError, "Không đọc được dòng hóa đơn.");
  if (existingFailure) return existingFailure;

  if (!existing) {
    if (delta < 0) return { ok: false, error: "Món chưa có trên hóa đơn." };
    const { error } = await supabase.from("invoice_items").insert({
      invoice_id: invoiceId,
      product_id: productId,
      initial_qty: 0,
      ordered_qty: 1,
      remaining_qty: minibar ? 1 : 0,
      price: Number(product.selling_price),
    });
    const insertFailure = fail(error, "Không thêm được món.");
    if (insertFailure) return insertFailure;
  } else {
    const initial = Number(existing.initial_qty);
    const ordered = Number(existing.ordered_qty) + delta;
    if (ordered < 0) return { ok: false, error: "Không giảm dưới số đã gọi thêm." };
    if (ordered === 0 && initial === 0) {
      const { error } = await supabase.from("invoice_items").delete().eq("id", existing.id);
      const deleteFailure = fail(error, "Không xóa được món.");
      if (deleteFailure) return deleteFailure;
    } else {
      const available = initial + ordered;
      const remaining = minibar
        ? Math.min(available, Math.max(0, Number(existing.remaining_qty) + delta))
        : 0;
      const { error } = await supabase
        .from("invoice_items")
        .update({ ordered_qty: ordered, remaining_qty: remaining })
        .eq("id", existing.id);
      const updateFailure = fail(error, "Không sửa được số lượng.");
      if (updateFailure) return updateFailure;
    }
  }

  // Totals are recalculated at checkout — avoid extra queries/revalidate on every +/- tap.
  return { ok: true };
}

export async function assignStaffBooking(input: {
  invoiceId: string;
  staffId: string;
  hoursWorked: number;
  customerRate: number;
  staffPayoutRate: number;
}): Promise<ActionResult> {
  const hours = roundMoney(Number(input.hoursWorked));
  const customerRate = roundMoney(Number(input.customerRate));
  const payoutRate = roundMoney(Number(input.staffPayoutRate));

  if (!input.invoiceId) return { ok: false, error: "Không có hóa đơn đang mở." };
  if (!input.staffId) return { ok: false, error: "Chọn nhân viên phục vụ." };
  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, error: "Số giờ phải lớn hơn 0." };
  }
  if (!Number.isFinite(customerRate) || customerRate < 0) {
    return { ok: false, error: "Giá khách phải là số không âm." };
  }
  if (!Number.isFinite(payoutRate) || payoutRate < 0) {
    return { ok: false, error: "Tiền trả nhân viên phải là số không âm." };
  }
  if (payoutRate > customerRate) {
    return { ok: false, error: "Tiền trả nhân viên không được cao hơn giá khách." };
  }

  const supabase = await createClient();
  const { data: invoice, error: invoiceError } = await activeInvoice(supabase, input.invoiceId);
  const invoiceFailure = fail(invoiceError, "Không đọc được hóa đơn.");
  if (invoiceFailure) return invoiceFailure;
  if (!invoice) return { ok: false, error: "Hóa đơn không còn mở." };

  const { error } = await supabase.from("invoice_staff_bookings").insert({
    invoice_id: input.invoiceId,
    staff_id: input.staffId,
    hours_worked: hours,
    customer_rate: customerRate,
    staff_payout_rate: payoutRate,
  });

  const insertFailure = fail(error, "Không gán được nhân viên.");
  if (insertFailure) return insertFailure;

  return { ok: true };
}

export async function removeStaffBooking(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: booking, error: readError } = await supabase
    .from("invoice_staff_bookings")
    .select("id, invoice_id")
    .eq("id", bookingId)
    .maybeSingle();

  const readFailure = fail(readError, "Không đọc được booking.");
  if (readFailure) return readFailure;
  if (!booking) return { ok: false, error: "Không tìm thấy booking." };

  const { data: invoice, error: invoiceError } = await activeInvoice(
    supabase,
    String(booking.invoice_id),
  );
  const invoiceFailure = fail(invoiceError, "Không đọc được hóa đơn.");
  if (invoiceFailure) return invoiceFailure;
  if (!invoice) return { ok: false, error: "Chỉ xóa được booking trên hóa đơn đang mở." };

  const { error } = await supabase.from("invoice_staff_bookings").delete().eq("id", bookingId);
  const deleteFailure = fail(error, "Không xóa được booking.");
  if (deleteFailure) return deleteFailure;

  return { ok: true };
}

async function applyAudit(
  supabase: Supabase,
  invoiceId: string,
  audit: StockAuditLine[],
): Promise<ActionResult> {
  const { data: lines, error: lineError } = await supabase
    .from("invoice_items")
    .select("id, product_id, initial_qty, ordered_qty, products(name, is_minibar_item)")
    .eq("invoice_id", invoiceId);

  const lineFailure = fail(lineError, "Không đọc được món trên hóa đơn.");
  if (lineFailure) return lineFailure;

  const audited = new Map(
    audit.map((line) => [String(line.productId), line.remainingQty]),
  );

  const updates: { id: string; remaining: number; name: string }[] = [];

  for (const line of lines ?? []) {
    const product = Array.isArray(line.products) ? line.products[0] : line.products;
    const name = relatedName(line.products, "Món");
    const productId = String(line.product_id);
    const initial = Number(line.initial_qty);
    const ordered = Number(line.ordered_qty);
    const available = availableQty(initial, ordered);
    const needsAudit = lineNeedsAudit({
      is_minibar_item: Boolean(product?.is_minibar_item),
      initial_qty: initial,
    });

    let remaining = 0;
    if (needsAudit) {
      if (!audited.has(productId)) {
        return { ok: false, error: `Thiếu số còn lại của ${name}.` };
      }
      const entered = wholeNumber(Number(audited.get(productId)));
      if (entered === null || entered > available) {
        return {
          ok: false,
          error: `Số còn lại của ${name} phải là số nguyên từ 0 đến ${available}.`,
        };
      }
      remaining = entered;
    }

    updates.push({ id: String(line.id), remaining, name });
  }

  // Parallel updates — sequential N round-trips made checkout feel frozen.
  const results = await Promise.all(
    updates.map((row) =>
      supabase
        .from("invoice_items")
        .update({ remaining_qty: row.remaining })
        .eq("id", row.id)
        .then((result) => ({ ...row, error: result.error })),
    ),
  );

  for (const row of results) {
    const updateFailure = fail(row.error, `Không lưu được số còn lại của ${row.name}.`);
    if (updateFailure) return updateFailure;
  }

  return { ok: true };
}

async function loadInvoiceTotals(
  supabase: Supabase,
  invoiceId: string,
  options?: { requireActive?: boolean },
) {
  let invoice: {
    id: unknown;
    room_id: unknown;
    room_total: unknown;
    start_time: unknown;
    end_time: unknown;
    status: unknown;
    payment_method?: unknown;
    cash_amount?: unknown;
    transfer_amount?: unknown;
  } | null = null;

  {
    const withPay = await supabase
      .from("invoices")
      .select(
        "id, room_id, room_total, start_time, end_time, status, payment_method, cash_amount, transfer_amount",
      )
      .eq("id", invoiceId)
      .maybeSingle();
    if (withPay.error) {
      // Older DB without payment columns — still allow checkout.
      const basic = await supabase
        .from("invoices")
        .select("id, room_id, room_total, start_time, end_time, status")
        .eq("id", invoiceId)
        .maybeSingle();
      if (basic.error) return { error: basic.error.message };
      invoice = basic.data;
    } else {
      invoice = withPay.data;
    }
  }
  if (!invoice) return { error: "Không tìm thấy hóa đơn." };
  if (options?.requireActive && invoice.status !== "ACTIVE") {
    return { error: "Hóa đơn không còn mở." };
  }

  const payment_method = invoice.payment_method ?? null;
  const cash_amount = invoice.cash_amount ?? 0;
  const transfer_amount = invoice.transfer_amount ?? 0;

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("name, type, hourly_rate")
    .eq("id", invoice.room_id)
    .maybeSingle();
  if (roomError) return { error: roomError.message };
  if (!room) return { error: "Không tìm thấy phòng của hóa đơn." };

  const { data: itemRows, error: itemError } = await supabase
    .from("invoice_items")
    .select("product_id, consumed_qty, ordered_qty, price, products(name)")
    .eq("invoice_id", invoiceId);
  if (itemError) return { error: itemError.message };

  const lines: ReceiptLine[] = [];
  let itemsTotal = 0;
  for (const item of itemRows ?? []) {
    const qty = Math.max(0, Number(item.consumed_qty));
    if (qty <= 0 && Number(item.ordered_qty) <= 0) continue;
    const chargeQty = qty > 0 ? qty : Number(item.ordered_qty);
    if (chargeQty <= 0) continue;
    const price = Number(item.price);
    const amount = roundMoney(chargeQty * price);
    itemsTotal = roundMoney(itemsTotal + amount);
    lines.push({
      productId: String(item.product_id),
      name: relatedName(item.products, "Món"),
      qty: chargeQty,
      price,
      amount,
      canReduce: Number(item.ordered_qty) > 0,
    });
  }

  const { data: bookings, error: bookingError } = await supabase
    .from("invoice_staff_bookings")
    .select("hours_worked, customer_rate")
    .eq("invoice_id", invoiceId);
  if (bookingError) return { error: bookingError.message };

  const staffTotal = roundMoney(
    (bookings ?? []).reduce(
      (sum, booking) =>
        sum + staffCustomerCharge(Number(booking.hours_worked), Number(booking.customer_rate)),
      0,
    ),
  );

  const end =
    invoice.status === "PAID" && invoice.end_time
      ? new Date(String(invoice.end_time))
      : new Date();
  const hours = billableHours(String(invoice.start_time), end.getTime());
  const hourlyRate = Number(room.hourly_rate);
  const roomTotal = roundMoney(hours * hourlyRate);
  const serviceTotalAmount = roundMoney(itemsTotal + staffTotal);
  const grandTotal = roundMoney(roomTotal + serviceTotalAmount);

  return {
    error: null as string | null,
    invoice: {
      ...invoice,
      payment_method,
      cash_amount,
      transfer_amount,
    },
    roomName: String(room.name),
    roomType: String(room.type),
    startTime: String(invoice.start_time),
    endTime: invoice.end_time ? String(invoice.end_time) : end.toISOString(),
    hourlyRate,
    billableHours: hours,
    end,
    roomTotal,
    itemsTotal,
    staffTotal,
    serviceTotalAmount,
    grandTotal,
    lines,
  };
}

async function bankSettings(supabase: Supabase) {
  const { data: settings, error } = await supabase
    .from("shop_settings")
    .select("bank_bin, bank_account_number, bank_account_name")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message, settings: null };
  return {
    error: null as string | null,
    settings: {
      bankBin: String(settings?.bank_bin ?? ""),
      bankAccountNumber: String(settings?.bank_account_number ?? ""),
      bankAccountName: String(settings?.bank_account_name ?? ""),
    },
  };
}

async function toPaymentCheckout(
  supabase: Supabase,
  invoiceId: string,
  requireActive: boolean,
): Promise<PrepareCheckoutResult> {
  const totals = await loadInvoiceTotals(supabase, invoiceId, { requireActive });
  if (totals.error || !totals.invoice) {
    return { ok: false, error: totals.error ?? "Không tính được hóa đơn." };
  }
  const bank = await bankSettings(supabase);
  if (bank.error || !bank.settings) return { ok: false, error: bank.error ?? "Không đọc được cài đặt." };

  return {
    ok: true,
    invoiceId,
    roomName: totals.roomName,
    roomType: totals.roomType,
    startTime: totals.startTime,
    hourlyRate: totals.hourlyRate,
    billableHours: totals.billableHours,
    roomTotal: totals.roomTotal,
    itemsTotal: totals.itemsTotal,
    staffTotal: totals.staffTotal,
    grandTotal: totals.grandTotal,
    lines: totals.lines,
    ...bank.settings,
  };
}

export async function prepareCheckout(
  invoiceId: string,
  audit: StockAuditLine[],
): Promise<PrepareCheckoutResult> {
  const supabase = await createClient();
  const applied = await applyAudit(supabase, invoiceId, audit);
  if (!applied.ok) return applied;

  // One totals pass + bank settings — avoid a second full reload (was freezing the UI).
  const [totals, bank] = await Promise.all([
    loadInvoiceTotals(supabase, invoiceId, { requireActive: true }),
    bankSettings(supabase),
  ]);
  if (totals.error || !totals.invoice) {
    return { ok: false, error: totals.error ?? "Không tính được hóa đơn." };
  }
  if (bank.error || !bank.settings) {
    return { ok: false, error: bank.error ?? "Không đọc được cài đặt ngân hàng." };
  }

  const { error: saveError } = await supabase
    .from("invoices")
    .update({
      room_total: totals.roomTotal,
      service_total: totals.serviceTotalAmount,
      grand_total: totals.grandTotal,
    })
    .eq("id", invoiceId)
    .eq("status", "ACTIVE");

  if (saveError) return { ok: false, error: saveError.message };

  return {
    ok: true,
    invoiceId,
    roomName: totals.roomName,
    roomType: totals.roomType,
    startTime: totals.startTime,
    hourlyRate: totals.hourlyRate,
    billableHours: totals.billableHours,
    roomTotal: totals.roomTotal,
    itemsTotal: totals.itemsTotal,
    staffTotal: totals.staffTotal,
    grandTotal: totals.grandTotal,
    lines: totals.lines,
    ...bank.settings,
  };
}

export async function recomputeCheckout(invoiceId: string): Promise<PrepareCheckoutResult> {
  const supabase = await createClient();
  const totals = await loadInvoiceTotals(supabase, invoiceId, { requireActive: true });
  if (totals.error || !totals.invoice) {
    return { ok: false, error: totals.error ?? "Không tính được hóa đơn." };
  }

  const { error: saveError } = await supabase
    .from("invoices")
    .update({
      room_total: totals.roomTotal,
      service_total: totals.serviceTotalAmount,
      grand_total: totals.grandTotal,
    })
    .eq("id", invoiceId)
    .eq("status", "ACTIVE");
  if (saveError) return { ok: false, error: saveError.message };

  return toPaymentCheckout(supabase, invoiceId, true);
}

export async function confirmPaid(input: ConfirmPaymentInput): Promise<ActionResult> {
  const method = input.method;
  if (!isPaymentMethod(method)) return { ok: false, error: "Hình thức thanh toán không hợp lệ." };

  const cashAmount = roundMoney(Number(input.cashAmount) || 0);
  const transferAmount = roundMoney(Number(input.transferAmount) || 0);
  if (cashAmount < 0 || transferAmount < 0) {
    return { ok: false, error: "Số tiền thanh toán không hợp lệ." };
  }

  const supabase = await createClient();
  const totals = await loadInvoiceTotals(supabase, input.invoiceId, { requireActive: true });
  if (totals.error || !totals.invoice) {
    return { ok: false, error: totals.error ?? "Không chốt được hóa đơn." };
  }

  if (roundMoney(cashAmount + transferAmount) !== roundMoney(totals.grandTotal)) {
    return { ok: false, error: "Tiền mặt + chuyển khoản phải bằng tổng hóa đơn." };
  }
  if (method === "CASH" && transferAmount !== 0) {
    return { ok: false, error: "Thanh toán tiền mặt không được có phần chuyển khoản." };
  }
  if (method === "QR" && cashAmount !== 0) {
    return { ok: false, error: "Thanh toán QR không được có phần tiền mặt." };
  }
  if (method === "SPLIT" && (cashAmount <= 0 || transferAmount <= 0)) {
    return { ok: false, error: "Thanh toán kết hợp cần vừa tiền mặt vừa chuyển khoản." };
  }

  const basePaid = {
    end_time: totals.end.toISOString(),
    room_total: totals.roomTotal,
    service_total: totals.serviceTotalAmount,
    grand_total: totals.grandTotal,
    status: "PAID" as const,
  };

  const withPayment = await supabase
    .from("invoices")
    .update({
      ...basePaid,
      payment_method: method,
      cash_amount: cashAmount,
      transfer_amount: transferAmount,
    })
    .eq("id", input.invoiceId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle();

  let paid = withPayment.data;
  let payError = withPayment.error;

  // Older databases may lack payment columns — still close the bill.
  if (payError) {
    const fallback = await supabase
      .from("invoices")
      .update(basePaid)
      .eq("id", input.invoiceId)
      .eq("status", "ACTIVE")
      .select("id")
      .maybeSingle();
    paid = fallback.data;
    payError = fallback.error;
  }

  const payFailure = fail(payError, "Không xác nhận thanh toán.");
  if (payFailure) return payFailure;
  if (!paid) return { ok: false, error: "Hóa đơn đã được chốt." };

  const { error: roomUpdateError } = await supabase
    .from("rooms")
    .update({ status: "CLEANING" })
    .eq("id", totals.invoice.room_id);

  const roomUpdateFailure = fail(roomUpdateError, "Đã nhận tiền nhưng chưa chuyển phòng sang dọn.");
  if (roomUpdateFailure) return roomUpdateFailure;

  // Client already flipped room to CLEANING; skip heavy POS revalidate for snappy UX.
  return { ok: true };
}

export async function listPeriodRevenue(
  period: RevenuePeriod,
  periodKey: string,
): Promise<{ ok: true; data: PeriodRevenue } | { ok: false; error: string }> {
  const bounds =
    period === "day"
      ? vietnamDayBounds(periodKey)
      : period === "week"
        ? vietnamWeekBounds(periodKey)
        : vietnamMonthBounds(periodKey);

  const label =
    period === "day"
      ? formatVietnamDayLabel(periodKey)
      : period === "week"
        ? formatVietnamWeekLabel(periodKey)
        : formatVietnamMonthLabel(periodKey);
  const longLabel =
    period === "day"
      ? formatVietnamDayLong(periodKey)
      : period === "week"
        ? formatVietnamWeekLong(periodKey)
        : formatVietnamMonthLong(periodKey);

  const supabase = await createClient();
  let { data, error } = await supabase
    .from("invoices")
    .select(
      "id, start_time, end_time, room_total, service_total, grand_total, payment_method, cash_amount, transfer_amount, rooms(name)",
    )
    .eq("status", "PAID")
    .gte("end_time", bounds.startIso)
    .lt("end_time", bounds.endIso)
    .order("end_time", { ascending: false });

  if (error) {
    const fallback = await supabase
      .from("invoices")
      .select("id, start_time, end_time, room_total, service_total, grand_total, rooms(name)")
      .eq("status", "PAID")
      .gte("end_time", bounds.startIso)
      .lt("end_time", bounds.endIso)
      .order("end_time", { ascending: false });
    data = (fallback.data ?? []).map((row) => ({
      ...row,
      payment_method: null,
      cash_amount: 0,
      transfer_amount: 0,
    }));
    error = fallback.error;
  }

  if (error) return { ok: false, error: error.message };

  const invoiceIds = (data ?? []).map((row) => String(row.id));
  const itemsByInvoice = new Map<string, number>();
  const staffByInvoice = new Map<string, number>();

  if (invoiceIds.length > 0) {
    const [{ data: items }, { data: bookings }] = await Promise.all([
      supabase
        .from("invoice_items")
        .select("invoice_id, consumed_qty, ordered_qty, price")
        .in("invoice_id", invoiceIds),
      supabase
        .from("invoice_staff_bookings")
        .select("invoice_id, hours_worked, customer_rate")
        .in("invoice_id", invoiceIds),
    ]);

    for (const item of items ?? []) {
      const qty = Math.max(0, Number(item.consumed_qty));
      const chargeQty = qty > 0 ? qty : Math.max(0, Number(item.ordered_qty));
      const amount = roundMoney(chargeQty * Number(item.price));
      const key = String(item.invoice_id);
      itemsByInvoice.set(key, roundMoney((itemsByInvoice.get(key) ?? 0) + amount));
    }
    for (const booking of bookings ?? []) {
      const key = String(booking.invoice_id);
      const amount = staffCustomerCharge(
        Number(booking.hours_worked),
        Number(booking.customer_rate),
      );
      staffByInvoice.set(key, roundMoney((staffByInvoice.get(key) ?? 0) + amount));
    }
  }

  let roomTotal = 0;
  let itemsTotal = 0;
  let staffTotal = 0;
  let grandTotal = 0;
  let cashTotal = 0;
  let transferTotal = 0;

  const bills = (data ?? []).map((row) => {
    const id = String(row.id);
    const billItems = itemsByInvoice.get(id) ?? 0;
    const billStaff = staffByInvoice.get(id) ?? 0;
    const billRoom = Number(row.room_total);
    const billGrand = Number(row.grand_total);
    const endTime = String(row.end_time);
    const hours = billableHours(String(row.start_time), new Date(endTime).getTime());
    const methodRaw = row.payment_method ? String(row.payment_method) : null;
    const paymentMethod = methodRaw && isPaymentMethod(methodRaw) ? methodRaw : null;

    roomTotal = roundMoney(roomTotal + billRoom);
    itemsTotal = roundMoney(itemsTotal + billItems);
    staffTotal = roundMoney(staffTotal + billStaff);
    grandTotal = roundMoney(grandTotal + billGrand);
    cashTotal = roundMoney(cashTotal + Number(row.cash_amount ?? 0));
    transferTotal = roundMoney(transferTotal + Number(row.transfer_amount ?? 0));

    return {
      id,
      roomName: relatedName(row.rooms, "Phòng"),
      startTime: String(row.start_time),
      endTime,
      billableHours: hours,
      roomTotal: billRoom,
      itemsTotal: billItems,
      staffTotal: billStaff,
      grandTotal: billGrand,
      paymentMethod,
      cashAmount: Number(row.cash_amount ?? 0),
      transferAmount: Number(row.transfer_amount ?? 0),
    };
  });

  const yearMonth = period === "month" ? periodKey : periodKey.slice(0, 7);

  return {
    ok: true,
    data: {
      period,
      periodKey,
      label,
      longLabel,
      yearMonth,
      monthLabel: label,
      monthLongLabel: longLabel,
      billCount: bills.length,
      roomTotal,
      itemsTotal,
      staffTotal,
      grandTotal,
      cashTotal,
      transferTotal,
      bills,
    },
  };
}

export async function listMonthlyRevenue(yearMonth: string) {
  return listPeriodRevenue("month", yearMonth);
}

export async function getPaidBillDetail(
  invoiceId: string,
): Promise<{ ok: true; data: PaidBillDetail } | { ok: false; error: string }> {
  const supabase = await createClient();
  const totals = await loadInvoiceTotals(supabase, invoiceId);
  if (totals.error || !totals.invoice) {
    return { ok: false, error: totals.error ?? "Không đọc được hóa đơn." };
  }
  if (totals.invoice.status !== "PAID") {
    return { ok: false, error: "Hóa đơn chưa thanh toán." };
  }

  const methodRaw = totals.invoice.payment_method
    ? String(totals.invoice.payment_method)
    : null;

  return {
    ok: true,
    data: {
      id: invoiceId,
      roomName: totals.roomName,
      roomType: totals.roomType,
      startTime: totals.startTime,
      endTime: totals.endTime,
      hourlyRate: totals.hourlyRate,
      billableHours: totals.billableHours,
      roomTotal: totals.roomTotal,
      itemsTotal: totals.itemsTotal,
      staffTotal: totals.staffTotal,
      grandTotal: totals.grandTotal,
      paymentMethod: methodRaw && isPaymentMethod(methodRaw) ? methodRaw : null,
      cashAmount: Number(totals.invoice.cash_amount ?? 0),
      transferAmount: Number(totals.invoice.transfer_amount ?? 0),
      lines: totals.lines,
    },
  };
}

export async function adjustPaidInvoiceItem(
  invoiceId: string,
  productId: string,
  delta: number,
  managerPin: string,
): Promise<ActionResult> {
  if (delta !== 1 && delta !== -1) return { ok: false, error: "Số lượng không hợp lệ." };

  const supabase = await createClient();
  const admin = await requireAdminPin(managerPin);
  if (!admin.ok) return admin;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, end_time, status")
    .eq("id", invoiceId)
    .eq("status", "PAID")
    .maybeSingle();
  if (invoiceError) return { ok: false, error: invoiceError.message };
  if (!invoice) return { ok: false, error: "Chỉ sửa được hóa đơn đã thanh toán." };

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, selling_price, is_minibar_item, category, stock_quantity")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return { ok: false, error: productError.message };
  if (!product) return { ok: false, error: "Không tìm thấy món." };

  const minibar = Boolean(product.is_minibar_item);
  const { data: existing, error: existingError } = await supabase
    .from("invoice_items")
    .select("id, initial_qty, ordered_qty, remaining_qty, consumed_qty")
    .eq("invoice_id", invoiceId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };

  const oldConsumed = existing ? Math.max(0, Number(existing.consumed_qty)) : 0;

  if (!existing) {
    if (delta < 0) return { ok: false, error: "Món chưa có trên hóa đơn." };
    const { error } = await supabase.from("invoice_items").insert({
      invoice_id: invoiceId,
      product_id: productId,
      initial_qty: 0,
      ordered_qty: 1,
      remaining_qty: minibar ? 1 : 0,
      price: Number(product.selling_price),
    });
    const insertFailure = fail(error, "Không thêm được món.");
    if (insertFailure) return insertFailure;
  } else {
    const initial = Number(existing.initial_qty);
    const ordered = Number(existing.ordered_qty) + delta;
    if (ordered < 0) return { ok: false, error: "Không giảm dưới số đã gọi thêm." };
    if (ordered === 0 && initial === 0) {
      const { error } = await supabase.from("invoice_items").delete().eq("id", existing.id);
      const deleteFailure = fail(error, "Không xóa được món.");
      if (deleteFailure) return deleteFailure;
    } else {
      const available = initial + ordered;
      const remaining = minibar
        ? Math.min(available, Math.max(0, Number(existing.remaining_qty) + delta))
        : 0;
      const { error } = await supabase
        .from("invoice_items")
        .update({ ordered_qty: ordered, remaining_qty: remaining })
        .eq("id", existing.id);
      const updateFailure = fail(error, "Không sửa được số lượng.");
      if (updateFailure) return updateFailure;
    }
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("invoice_items")
    .select("consumed_qty")
    .eq("invoice_id", invoiceId)
    .eq("product_id", productId)
    .maybeSingle();
  if (refreshError) return { ok: false, error: refreshError.message };
  const newConsumed = refreshed ? Math.max(0, Number(refreshed.consumed_qty)) : 0;
  const stockDelta = newConsumed - oldConsumed;

  if (stockDelta !== 0 && String(product.category) !== "SERVICE") {
    if (stockDelta > 0 && Number(product.stock_quantity) < stockDelta) {
      return {
        ok: false,
        error: `Không đủ tồn kho cho món này (còn ${product.stock_quantity}).`,
      };
    }
    const { error: stockError } = await supabase
      .from("products")
      .update({ stock_quantity: Number(product.stock_quantity) - stockDelta })
      .eq("id", productId);
    if (stockError) return { ok: false, error: stockError.message };
  }

  const totals = await loadInvoiceTotals(supabase, invoiceId);
  if (totals.error || !totals.invoice) {
    return { ok: false, error: totals.error ?? "Không tính lại được hóa đơn." };
  }

  const cash = Number(totals.invoice.cash_amount ?? 0);
  const transfer = Number(totals.invoice.transfer_amount ?? 0);
  const method = totals.invoice.payment_method
    ? String(totals.invoice.payment_method)
    : null;
  let nextCash = cash;
  let nextTransfer = transfer;
  if (method === "CASH") {
    nextCash = totals.grandTotal;
    nextTransfer = 0;
  } else if (method === "QR") {
    nextCash = 0;
    nextTransfer = totals.grandTotal;
  } else if (method === "SPLIT") {
    const ratio = cash + transfer > 0 ? cash / (cash + transfer) : 0.5;
    nextCash = roundMoney(totals.grandTotal * ratio);
    nextTransfer = roundMoney(totals.grandTotal - nextCash);
  }

  const { error: saveError } = await supabase
    .from("invoices")
    .update({
      room_total: totals.roomTotal,
      service_total: totals.serviceTotalAmount,
      grand_total: totals.grandTotal,
      cash_amount: nextCash,
      transfer_amount: nextTransfer,
    })
    .eq("id", invoiceId)
    .eq("status", "PAID");
  if (saveError) return { ok: false, error: saveError.message };

  refreshPos(["/admin/revenue", "/admin/inventory"]);
  return { ok: true };
}

export async function markRoomAvailable(roomId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .update({ status: "AVAILABLE" })
    .eq("id", roomId)
    .eq("status", "CLEANING")
    .select("id")
    .maybeSingle();

  const updateFailure = fail(error, "Không cập nhật được phòng.");
  if (updateFailure) return updateFailure;
  if (!data) return { ok: false, error: "Phòng không ở trạng thái đang dọn." };

  // Client updates local room status — skip POS revalidate lag.
  return { ok: true };
}
