export function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function elapsedParts(startIso: string, nowMs: number) {
  const elapsedMs = Math.max(0, nowMs - new Date(startIso).getTime());
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { elapsedMs, hours, minutes, seconds };
}

export function formatElapsed(startIso: string, nowMs: number) {
  const { hours, minutes, seconds } = elapsedParts(startIso, nowMs);
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** Karaoke rooms bill by whole hours. First hour starts immediately. */
export function billableHours(startIso: string, nowMs: number) {
  const { elapsedMs } = elapsedParts(startIso, nowMs);
  return Math.max(1, Math.ceil(elapsedMs / 3_600_000));
}

export function estimatedRoomCost(
  startIso: string,
  hourlyRate: number,
  nowMs: number,
) {
  return roundMoney(billableHours(startIso, nowMs) * hourlyRate);
}
