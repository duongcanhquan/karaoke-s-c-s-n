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
};

export type StaffOption = {
  id: string;
  name: string;
  role: string;
};

export type StockAuditLine = {
  itemId: string;
  remainingQty: number;
};

export type ActionResult = { ok: true } | { ok: false; error: string };

export type PaymentCheckout = {
  invoiceId: string;
  roomName: string;
  grandTotal: number;
  bankBin: string;
  bankAccountNumber: string;
  bankAccountName: string;
};

export type PrepareCheckoutResult =
  | ({ ok: true } & PaymentCheckout)
  | { ok: false; error: string };
