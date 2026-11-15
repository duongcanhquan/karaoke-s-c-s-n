export function PanelLoading({
  label = "Đang tải dữ liệu…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-5 shrink-0 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin"
        />
        <p className="text-base font-semibold text-foreground">{label}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-28 rounded-xl bg-muted motion-safe:animate-pulse" />
        <div className="h-28 rounded-xl bg-muted motion-safe:animate-pulse" />
      </div>
      <div className="h-40 rounded-xl bg-muted motion-safe:animate-pulse" />
    </div>
  );
}
