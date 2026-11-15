export type RoomStatus = "AVAILABLE" | "IN_USE" | "CLEANING";

export type Room = {
  id: string;
  name: string;
  type: string;
  hourly_rate: number;
  status: RoomStatus;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  selling_price: number;
  is_minibar_item: boolean;
};

export type Invoice = {
  id: string;
  start_time: string;
  room_total: number;
  service_total: number;
  grand_total: number;
  status: "ACTIVE" | "PAID";
};

export type InvoiceItem = {
  id: string;
  product_id: string;
  name: string;
  is_minibar_item: boolean;
  initial_qty: number;
  ordered_qty: number;
  remaining_qty: number;
  consumed_qty: number;
  price: number;
};

export type StaffBooking = {
  id: string;
  staff_id: string;
  staff_name: string;
  hours_worked: number;
  customer_rate: number;
  staff_payout_rate: number;
  profit: number;
  start_time: string | null;
  end_time: string | null;
};

export type StaffOption = {
  id: string;
  name: string;
  displayName: string;
  role: string;
  customerRate: number;
  staffPayoutRate: number;
};

export type RoomSetupItem = {
  productId: string;
  productName: string;
  quantity: number;
};

export type StockAuditLine = {
  /** Match by product — never by optimistic local item ids. */
  productId: string;
  remainingQty: number;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

export type AssignStaffResult =
  | { ok: true; booking: StaffBooking }
  | { ok: false; error: string };

export type PaymentMethod = "CASH" | "QR" | "SPLIT";

export type ReceiptLine = {
  productId: string;
  name: string;
  qty: number;
  price: number;
  amount: number;
  canReduce: boolean;
};

export type ConfirmPaymentInput = {
  invoiceId: string;
  method: PaymentMethod;
  cashAmount: number;
  transferAmount: number;
};

export type PaidBillSummary = {
  id: string;
  roomName: string;
  startTime: string;
  endTime: string;
  billableHours: number;
  roomTotal: number;
  itemsTotal: number;
  staffTotal: number;
  grandTotal: number;
  paymentMethod: PaymentMethod | null;
  cashAmount: number;
  transferAmount: number;
};

export type PaidBillDetail = PaidBillSummary & {
  roomType: string;
  hourlyRate: number;
  lines: ReceiptLine[];
};

export type RevenuePeriod = "day" | "week" | "month";

export type PeriodRevenue = {
  period: RevenuePeriod;
  periodKey: string;
  label: string;
  longLabel: string;
  /** @deprecated use periodKey — kept for older month-only callers */
  yearMonth: string;
  monthLabel: string;
  monthLongLabel: string;
  billCount: number;
  roomTotal: number;
  itemsTotal: number;
  staffTotal: number;
  grandTotal: number;
  cashTotal: number;
  transferTotal: number;
  bills: PaidBillSummary[];
};

export type MonthlyRevenue = PeriodRevenue;

export type StaffReceiptLine = {
  bookingId: string;
  name: string;
  hours: number;
  rate: number;
  amount: number;
  startTime: string | null;
  endTime: string | null;
};

export type PaymentCheckout = {
  invoiceId: string;
  roomName: string;
  roomType: string;
  startTime: string;
  hourlyRate: number;
  billableHours: number;
  roomTotal: number;
  itemsTotal: number;
  staffTotal: number;
  grandTotal: number;
  lines: ReceiptLine[];
  staffLines: StaffReceiptLine[];
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

export type PrepareCheckoutResult =
  | ({ ok: true } & PaymentCheckout)
  | { ok: false; error: string };
