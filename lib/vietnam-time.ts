/** Calendar helpers in Vietnam time (UTC+7). Labels stay explicit for cashiers. */

export function vietnamNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return { year, month, day, yearMonth: `${year}-${month}`, date: `${year}-${month}-${day}` };
}

export function currentVietnamYearMonth(now = new Date()) {
  return vietnamNowParts(now).yearMonth;
}

/** "2026-11" → "Tháng 11 / 2026" */
export function formatVietnamMonthLabel(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) return yearMonth;
  const year = match[1];
  const month = Number(match[2]);
  if (month < 1 || month > 12) return yearMonth;
  return `Tháng ${month} / ${year}`;
}

/** "2026-11" → "Tháng mười một năm 2026" (spoken clarity for headers) */
export function formatVietnamMonthLong(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) return yearMonth;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const names = [
    "",
    "một",
    "hai",
    "ba",
    "tư",
    "năm",
    "sáu",
    "bảy",
    "tám",
    "chín",
    "mười",
    "mười một",
    "mười hai",
  ];
  if (month < 1 || month > 12) return yearMonth;
  return `Tháng ${names[month]} năm ${year}`;
}

export function shiftVietnamYearMonth(yearMonth: string, deltaMonths: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) return currentVietnamYearMonth();
  const base = Number(match[1]) * 12 + (Number(match[2]) - 1) + deltaMonths;
  const year = Math.floor(base / 12);
  const month = (base % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Inclusive start / exclusive end ISO bounds for Vietnam calendar month. */
export function vietnamMonthBounds(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) {
    const current = currentVietnamYearMonth();
    return vietnamMonthBounds(current);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+07:00`,
  );
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function formatVietnamDateTime(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function currentVietnamDate(now = new Date()) {
  return vietnamNowParts(now).date;
}

/** "2026-11-15" → "Ngày 15/11/2026" */
export function formatVietnamDayLabel(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return dateStr;
  return `Ngày ${Number(match[3])}/${Number(match[2])}/${match[1]}`;
}

export function formatVietnamDayLong(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function shiftVietnamDate(dateStr: string, deltaDays: number) {
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  d.setTime(d.getTime() + deltaDays * 86_400_000);
  return vietnamNowParts(d).date;
}

/** Inclusive start / exclusive end for one Vietnam calendar day. */
export function vietnamDayBounds(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return vietnamDayBounds(currentVietnamDate());
  const start = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Monday–Sunday week containing the Vietnam date. */
export function vietnamWeekBounds(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return vietnamWeekBounds(currentVietnamDate());
  const noon = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00+07:00`);
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
  }).format(noon);
  const mondayOffset: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = mondayOffset[weekdayShort] ?? 0;
  const mondayDate = shiftVietnamDate(dateStr, -offset);
  const nextMonday = shiftVietnamDate(mondayDate, 7);
  const start = new Date(`${mondayDate}T00:00:00+07:00`);
  const end = new Date(`${nextMonday}T00:00:00+07:00`);
  const sundayDate = shiftVietnamDate(mondayDate, 6);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    mondayDate,
    sundayDate,
  };
}

/** "Tuần 10/11 – 16/11/2026" */
export function formatVietnamWeekLabel(dateStr: string) {
  const { mondayDate, sundayDate } = vietnamWeekBounds(dateStr);
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mondayDate);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sundayDate);
  if (!a || !b) return `Tuần của ${dateStr}`;
  return `Tuần ${Number(a[3])}/${Number(a[2])} – ${Number(b[3])}/${Number(b[2])}/${b[1]}`;
}

export function formatVietnamWeekLong(dateStr: string) {
  const { mondayDate, sundayDate } = vietnamWeekBounds(dateStr);
  return `Từ ${formatVietnamDayLong(mondayDate)} đến ${formatVietnamDayLong(sundayDate)}`;
}

/** Header clock: "CN, 15/11/2026" */
export function formatVietnamHeaderDate(now = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
}

export function formatVietnamHeaderTime(now = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
