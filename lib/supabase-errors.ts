export function isMissingColumnError(message: string | undefined | null, column: string) {
  if (!message) return false;
  const lower = message.toLowerCase();
  const col = column.toLowerCase();
  if (!lower.includes(col)) return false;
  return (
    lower.includes("does not exist") ||
    lower.includes("could not find") ||
    lower.includes("schema cache") ||
    lower.includes("unknown column") ||
    lower.includes("column")
  );
}

export function isMissingDisplayNameError(message: string | undefined | null) {
  return isMissingColumnError(message, "display_name");
}

export function isRlsError(message: string | undefined | null) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("row-level security") ||
    lower.includes("row level security") ||
    lower.includes("violates row-level")
  );
}

/** User-facing DB error — map RLS to a clear Vietnamese fix hint. */
export function explainDbError(message: string | undefined | null, fallback: string) {
  const text = String(message ?? "").trim() || fallback;
  if (isRlsError(text)) {
    return `${text} — Chạy update_disable_rls_all.sql trong Supabase SQL Editor.`;
  }
  return text;
}

/** Loose row bag so display_name fallback selects type-check. */
export type LooseRows = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export function looseRows(result: {
  data: unknown;
  error: { message: string } | null;
}): LooseRows {
  return {
    data: Array.isArray(result.data)
      ? (result.data as Array<Record<string, unknown>>)
      : null,
    error: result.error,
  };
}
