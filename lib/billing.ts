import { roundMoney } from "@/lib/money";

export function lineNeedsAudit(item: {
  is_minibar_item: boolean;
  initial_qty: number;
}) {
  return item.is_minibar_item || item.initial_qty > 0;
}

export function availableQty(initialQty: number, orderedQty: number) {
  return initialQty + orderedQty;
}

export function consumedFromRemaining(
  initialQty: number,
  orderedQty: number,
  remainingQty: number,
) {
  return availableQty(initialQty, orderedQty) - remainingQty;
}

export function staffCustomerCharge(hoursWorked: number, customerRate: number) {
  return roundMoney(hoursWorked * customerRate);
}

export function staffPayout(hoursWorked: number, staffPayoutRate: number) {
  return roundMoney(hoursWorked * staffPayoutRate);
}

export function shopBookingProfit(hoursWorked: number, profitPerHour: number) {
  return roundMoney(hoursWorked * profitPerHour);
}
