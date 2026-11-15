export function PageSkeleton({ label = "Đang tải" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="h-8 w-48 max-w-full rounded-lg bg-muted motion-safe:animate-pulse" />
      <div className="h-4 w-72 max-w-full rounded-lg bg-muted motion-safe:animate-pulse" />
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-28 rounded-xl bg-muted motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export function PosSkeleton() {
  return (
    <div
      className="flex h-dvh w-screen flex-col bg-slate-950"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="sr-only">Đang tải quầy bán hàng</p>
      <div className="flex min-h-16 items-center justify-between border-b border-white/20 bg-white/90 px-4 md:min-h-20 md:px-8">
        <div className="h-6 w-32 rounded bg-slate-200 motion-safe:animate-pulse" />
        <div className="h-10 w-28 rounded bg-slate-200 motion-safe:animate-pulse" />
        <div className="h-12 w-24 rounded bg-slate-200 motion-safe:animate-pulse" />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-5 p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 md:p-8">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="min-h-52 rounded-3xl bg-white/15 motion-safe:animate-pulse md:min-h-64"
          />
        ))}
      </div>
    </div>
  );
}
