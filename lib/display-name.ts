/** Prefer customer-facing label; fall back to internal/login name. */
export function displayLabel(
  name: string | null | undefined,
  displayName?: string | null | undefined,
) {
  const shown = String(displayName ?? "").trim();
  if (shown) return shown;
  const fallback = String(name ?? "").trim();
  return fallback || "—";
}

export function relatedDisplayName(value: unknown, fallback: string) {
  if (!value) return fallback;
  const source = Array.isArray(value) ? value[0] : value;
  if (!source || typeof source !== "object") return fallback;
  const row = source as { display_name?: unknown; name?: unknown };
  return displayLabel(
    row.name != null ? String(row.name) : fallback,
    row.display_name != null ? String(row.display_name) : "",
  );
}
