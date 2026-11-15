import {
  consumedFromRemaining,
  lineNeedsAudit,
  staffCustomerCharge,
} from "@/lib/billing";
import { billableHours, roundMoney } from "@/lib/money";
import type {
  InvoiceItem,
  PaymentCheckout,
  ReceiptLine,
  Room,
  StaffBooking,
  StaffReceiptLine,
  StockAuditLine,
} from "@/lib/pos-types";

export type ShopCheckoutSettings = {
  bankBin: string;
  bankAccountNumber: string;
  bankAccountName: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  receiptFooter: string;
  printerPaperMm: 58 | 80;
  printerAutoPrint: boolean;
  printerCopies: number;
  printerName: string;
};

export const EMPTY_SHOP_SETTINGS: ShopCheckoutSettings = {
  bankBin: "",
  bankAccountNumber: "",
  bankAccountName: "",
  shopName: "Karaoke",
  shopAddress: "",
  shopPhone: "",
  receiptFooter: "Cảm ơn quý khách",
  printerPaperMm: 80,
  printerAutoPrint: false,
  printerCopies: 1,
  printerName: "",
};

/** Instant client-side totals so payment UI opens before the server round-trip. */
export function buildCheckoutPreview(input: {
  invoiceId: string;
  room: Room;
  startTime: string;
  items: InvoiceItem[];
  bookings: StaffBooking[];
  audit: StockAuditLine[];
  settings: ShopCheckoutSettings;
  nowMs?: number;
}): PaymentCheckout {
  const audited = new Map(
    input.audit.map((line) => [line.productId, line.remainingQty]),
  );
  const nowMs = input.nowMs ?? Date.now();
  const hours = billableHours(input.startTime, nowMs);
  const hourlyRate = Number(input.room.hourly_rate);
  const roomTotal = roundMoney(hours * hourlyRate);

  const lines: ReceiptLine[] = [];
  let itemsTotal = 0;
  for (const item of input.items) {
    const needsAudit = lineNeedsAudit(item);
    const remaining = needsAudit
      ? Number(audited.get(item.product_id) ?? item.remaining_qty)
      : 0;
    const qty = Math.max(
      0,
      consumedFromRemaining(item.initial_qty, item.ordered_qty, remaining),
    );
    if (qty <= 0) continue;
    const amount = roundMoney(qty * item.price);
    itemsTotal = roundMoney(itemsTotal + amount);
    lines.push({
      productId: item.product_id,
      name: item.name,
      qty,
      price: item.price,
      amount,
      canReduce: qty > 0,
    });
  }

  const staffLines: StaffReceiptLine[] = input.bookings.map((booking) => ({
    bookingId: booking.id,
    name: booking.staff_name,
    hours: booking.hours_worked,
    rate: booking.customer_rate,
    amount: staffCustomerCharge(booking.hours_worked, booking.customer_rate),
    startTime: booking.start_time,
    endTime: booking.end_time,
  }));
  const staffTotal = roundMoney(
    staffLines.reduce((sum, line) => sum + line.amount, 0),
  );
  const grandTotal = roundMoney(roomTotal + itemsTotal + staffTotal);

  return {
    invoiceId: input.invoiceId,
    roomName: input.room.name,
    roomType: input.room.type,
    startTime: input.startTime,
    hourlyRate,
    billableHours: hours,
    roomTotal,
    itemsTotal,
    staffTotal,
    grandTotal,
    lines,
    staffLines,
    ...input.settings,
  };
}
