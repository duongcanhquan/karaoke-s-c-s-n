"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  availableQty,
  lineNeedsAudit,
  staffCustomerCharge,
} from "@/lib/billing";
import { roundMoney } from "@/lib/money";
import type { ActionResult, PrepareCheckoutResult, StockAuditLine } from "@/lib/pos-types";

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

function refreshPos() {
  revalidatePath("/pos");
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/hr");
  revalidatePath("/admin/rooms");
}

async function serviceTotal(supabase: Supabase, invoiceId: string) {
  const { data, error } = await supabase
    .from("invoice_items")
    .select("consumed_qty, price")
    .eq("invoice_id", invoiceId);

  if (error) return { error, total: 0 };
  const total = roundMoney(
    (data ?? []).reduce(
      (sum, item) => sum + Number(item.consumed_qty) * Number(item.price),
      0,
    ),
  );
  return { error: null, total };
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

export async function startRoom(roomId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: room, error } = await supabase
    .from("rooms")
    .update({ status: "IN_USE" })
    .eq("id", roomId)
    .eq("status", "AVAILABLE")
    .select("id")
    .maybeSingle();

  const updateError = fail(error, "Không mở được phòng.");
  if (updateError) return updateError;
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
    .select("id")
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

  refreshPos();
  return { ok: true };
}

async function seedMinibar(
  supabase: Supabase,
  invoiceId: string,
  roomId: string,
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from("room_minibar_setup")
    .select("product_id, default_quantity, products(selling_price)")
    .eq("room_id", roomId);

  const setupError = fail(error, "Không đọc được minibar của phòng.");
  if (setupError) return setupError;

  const rows = (data ?? []).flatMap((setup) => {
    const quantity = Number(setup.default_quantity);
    const related = (Array.isArray(setup.products) ? setup.products[0] : setup.products) as
      | { selling_price?: unknown }
      | null
      | undefined;
    const price = Number(related?.selling_price);
    if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price)) return [];
    return [
      {
        invoice_id: invoiceId,
        product_id: setup.product_id,
        initial_qty: quantity,
        ordered_qty: 0,
        remaining_qty: quantity,
        price,
      },
    ];
  });

  if (rows.length === 0) return { ok: true };

  const { error: insertError } = await supabase.from("invoice_items").insert(rows);
  const insertFailure = fail(insertError, "Không nạp được minibar vào hóa đơn.");
  if (insertFailure) return insertFailure;
  return { ok: true };
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

  const totals = await serviceTotal(supabase, invoiceId);
  if (totals.error) return { ok: false, error: totals.error.message };

  const roomTotal = Number(invoice.room_total);
  const { error: totalError } = await supabase
    .from("invoices")
    .update({
      service_total: totals.total,
      grand_total: roundMoney(roomTotal + totals.total),
    })
    .eq("id", invoiceId)
    .eq("status", "ACTIVE");

  const totalFailure = fail(totalError, "Không cập nhật được tổng tiền.");
  if (totalFailure) return totalFailure;

  revalidatePath("/pos");
  return { ok: true };
}

export async function adjustInvoiceItem(
  invoiceId: string,
  productId: string,
  delta: number,
): Promise<ActionResult> {
  if (delta !== 1 && delta !== -1) return { ok: false, error: "Số lượng không hợp lệ." };

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

  const totals = await serviceTotal(supabase, invoiceId);
  if (totals.error) return { ok: false, error: totals.error.message };

  const { error: totalError } = await supabase
    .from("invoices")
    .update({
      service_total: totals.total,
      grand_total: roundMoney(Number(invoice.room_total) + totals.total),
    })
    .eq("id", invoiceId)
    .eq("status", "ACTIVE");
  const totalFailure = fail(totalError, "Không cập nhật được tổng tiền.");
  if (totalFailure) return totalFailure;

  revalidatePath("/pos");
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

  revalidatePath("/pos");
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

  revalidatePath("/pos");
  return { ok: true };
}

async function applyAudit(
  supabase: Supabase,
  invoiceId: string,
  audit: StockAuditLine[],
): Promise<ActionResult> {
  const { data: lines, error: lineError } = await supabase
    .from("invoice_items")
    .select("id, initial_qty, ordered_qty, products(name, is_minibar_item)")
    .eq("invoice_id", invoiceId);

  const lineFailure = fail(lineError, "Không đọc được món trên hóa đơn.");
  if (lineFailure) return lineFailure;

  const audited = new Map(audit.map((line) => [line.itemId, line.remainingQty]));

  for (const line of lines ?? []) {
    const product = Array.isArray(line.products) ? line.products[0] : line.products;
    const name = relatedName(line.products, "Món");
    const initial = Number(line.initial_qty);
    const ordered = Number(line.ordered_qty);
    const available = availableQty(initial, ordered);
    const needsAudit = lineNeedsAudit({
      is_minibar_item: Boolean(product?.is_minibar_item),
      initial_qty: initial,
    });

    let remaining = 0;
    if (needsAudit) {
      if (!audited.has(String(line.id))) {
        return { ok: false, error: `Thiếu số còn lại của ${name}.` };
      }
      const entered = wholeNumber(Number(audited.get(String(line.id))));
      if (entered === null || entered > available) {
        return {
          ok: false,
          error: `Số còn lại của ${name} phải là số nguyên từ 0 đến ${available}.`,
        };
      }
      remaining = entered;
    }

    const { error } = await supabase
      .from("invoice_items")
      .update({ remaining_qty: remaining })
      .eq("id", line.id);

    const updateFailure = fail(error, `Không lưu được số còn lại của ${name}.`);
    if (updateFailure) return updateFailure;
  }

  return { ok: true };
}

async function computeCheckoutTotals(supabase: Supabase, invoiceId: string) {
  const { data: invoice, error: invoiceError } = await activeInvoice(supabase, invoiceId);
  if (invoiceError) return { error: invoiceError.message };
  if (!invoice) return { error: "Hóa đơn không còn mở." };

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("name, hourly_rate")
    .eq("id", invoice.room_id)
    .maybeSingle();
  if (roomError) return { error: roomError.message };
  if (!room) return { error: "Không tìm thấy phòng của hóa đơn." };

  const totals = await serviceTotal(supabase, invoiceId);
  if (totals.error) return { error: totals.error.message };

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

  const end = new Date();
  const elapsedMs = Math.max(0, end.getTime() - new Date(invoice.start_time).getTime());
  const roomTotal = roundMoney((elapsedMs / 3_600_000) * Number(room.hourly_rate));
  const serviceTotalAmount = roundMoney(totals.total + staffTotal);
  const grandTotal = roundMoney(roomTotal + serviceTotalAmount);

  return {
    error: null as string | null,
    invoice,
    roomName: String(room.name),
    end,
    roomTotal,
    serviceTotalAmount,
    grandTotal,
  };
}

export async function prepareCheckout(
  invoiceId: string,
  audit: StockAuditLine[],
): Promise<PrepareCheckoutResult> {
  const supabase = await createClient();
  const applied = await applyAudit(supabase, invoiceId, audit);
  if (!applied.ok) return applied;

  const totals = await computeCheckoutTotals(supabase, invoiceId);
  if (totals.error || !totals.invoice) return { ok: false, error: totals.error ?? "Không tính được hóa đơn." };

  const { data: settings, error: settingsError } = await supabase
    .from("shop_settings")
    .select("bank_bin, bank_account_number, bank_account_name")
    .order("id")
    .limit(1)
    .maybeSingle();

  if (settingsError) return { ok: false, error: settingsError.message };
  if (!settings) {
    return { ok: false, error: "Chưa có cấu hình ngân hàng. Vào Quản trị → Cài đặt." };
  }
  if (!String(settings.bank_account_number).trim() || !String(settings.bank_account_name).trim()) {
    return { ok: false, error: "Chưa nhập số tài khoản hoặc tên chủ tài khoản." };
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

  refreshPos();
  return {
    ok: true,
    invoiceId,
    roomName: totals.roomName,
    grandTotal: totals.grandTotal,
    bankBin: String(settings.bank_bin),
    bankAccountNumber: String(settings.bank_account_number),
    bankAccountName: String(settings.bank_account_name),
  };
}

export async function confirmPaid(invoiceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const totals = await computeCheckoutTotals(supabase, invoiceId);
  if (totals.error || !totals.invoice) return { ok: false, error: totals.error ?? "Không chốt được hóa đơn." };

  const { data: paid, error: payError } = await supabase
    .from("invoices")
    .update({
      end_time: totals.end.toISOString(),
      room_total: totals.roomTotal,
      service_total: totals.serviceTotalAmount,
      grand_total: totals.grandTotal,
      status: "PAID",
    })
    .eq("id", invoiceId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle();

  const payFailure = fail(payError, "Không xác nhận thanh toán.");
  if (payFailure) return payFailure;
  if (!paid) return { ok: false, error: "Hóa đơn đã được chốt." };

  const { error: roomUpdateError } = await supabase
    .from("rooms")
    .update({ status: "CLEANING" })
    .eq("id", totals.invoice.room_id);

  const roomUpdateFailure = fail(roomUpdateError, "Đã nhận tiền nhưng chưa chuyển phòng sang dọn.");
  if (roomUpdateFailure) return roomUpdateFailure;

  refreshPos();
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

  revalidatePath("/pos");
  revalidatePath("/admin");
  revalidatePath("/admin/rooms");
  return { ok: true };
}
