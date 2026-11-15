import { roundMoney } from "@/lib/money";

export const shiftPayModes = ["HOURLY", "FIXED"] as const;
export type ShiftPayMode = (typeof shiftPayModes)[number];

export const clockPayModes = ["HOURLY", "FIXED", "ATTENDANCE"] as const;
export type ClockPayMode = (typeof clockPayModes)[number];

export const staffPayTypes = ["SHIFT", "MONTHLY"] as const;
export type StaffPayType = (typeof staffPayTypes)[number];

export function isShiftPayMode(value: string): value is ShiftPayMode {
  return (shiftPayModes as readonly string[]).includes(value);
}

export function isStaffPayType(value: string): value is StaffPayType {
  return (staffPayTypes as readonly string[]).includes(value);
}

/** Normalize "8:00" / "08:00:00" → "08:00:00" for Postgres time. */
export function normalizeTimeInput(value: string): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3] ?? 0);
  if (h > 23 || m > 59 || s > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** HH:MM or HH:MM:SS → HH:MM for display / `<input type="time">`. */
export function formatClockTime(value: string) {
  const normalized = normalizeTimeInput(String(value ?? ""));
  if (normalized) return normalized.slice(0, 5);
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return raw.slice(0, 5);
}

export function resolveClockRate(input: {
  payType: string;
  requireClockIn: boolean;
  templatePayMode: string;
  templateDefaultAmount: number;
  staffOverrideAmount: number | null;
  manualAmount: number | null;
  fallbackHourly: number;
}): { ok: true; payMode: ClockPayMode; rate: number } | { ok: false; error: string } {
  if (input.payType === "MONTHLY") {
    if (!input.requireClockIn) {
      return { ok: false, error: "Nhân viên lương tháng này không cần chấm công." };
    }
    return { ok: true, payMode: "ATTENDANCE", rate: 0 };
  }

  if (!isShiftPayMode(input.templatePayMode)) {
    return { ok: false, error: "Mẫu ca không hợp lệ." };
  }

  let rate = roundMoney(Number(input.templateDefaultAmount) || 0);
  if (input.staffOverrideAmount != null && Number.isFinite(input.staffOverrideAmount)) {
    rate = roundMoney(input.staffOverrideAmount);
  }
  if (input.manualAmount != null && Number.isFinite(input.manualAmount) && input.manualAmount > 0) {
    rate = roundMoney(input.manualAmount);
  }
  if (rate <= 0 && input.fallbackHourly > 0 && input.templatePayMode === "HOURLY") {
    rate = roundMoney(input.fallbackHourly);
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false, error: "Mức lương ca phải ≥ 0." };
  }
  if (rate <= 0) {
    return {
      ok: false,
      error: "Mẫu ca chưa có mức lương — nhập mức lần này hoặc cập nhật mẫu ca / mức NV.",
    };
  }

  return { ok: true, payMode: input.templatePayMode, rate };
}

export function computeShiftTotal(input: {
  payMode: string | null | undefined;
  rate: number;
  startTime: string | Date;
  endTime: string | Date;
}) {
  const mode = input.payMode || "HOURLY";
  if (mode === "ATTENDANCE") return 0;
  if (mode === "FIXED") return roundMoney(Math.max(0, Number(input.rate) || 0));

  const start = new Date(input.startTime).getTime();
  const end = new Date(input.endTime).getTime();
  const hours = Math.max(0, end - start) / 3_600_000;
  return roundMoney(hours * (Number(input.rate) || 0));
}

export const payTypeLabel: Record<StaffPayType, string> = {
  SHIFT: "Theo ca",
  MONTHLY: "Lương tháng",
};

export const shiftPayModeLabel: Record<ShiftPayMode, string> = {
  HOURLY: "Theo giờ",
  FIXED: "Cố định / ca",
};
