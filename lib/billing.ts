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

/** Parse "HH:MM" or "HH:MM:SS" into minutes from midnight. */
export function parseClockToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Hours between two local clock times. If end <= start, treat as overnight (+24h). */
export function hoursBetweenClockTimes(startHhMm: string, endHhMm: string) {
  const start = parseClockToMinutes(startHhMm);
  const end = parseClockToMinutes(endHhMm);
  if (start === null || end === null) return null;
  let minutes = end - start;
  if (minutes <= 0) minutes += 24 * 60;
  return roundMoney(minutes / 60);
}
