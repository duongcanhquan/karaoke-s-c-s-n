"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { billableHours, formatElapsed } from "@/lib/money";

export function ElapsedClock({
  startTime,
}: {
  startTime: string;
  /** @deprecated Money is calculated only at checkout. Kept for call-site compat. */
  hourlyRate?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  const elapsed = formatElapsed(startTime, now);
  const hours = billableHours(startTime, now);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs text-muted-foreground">Thời gian hát</p>
        <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {elapsed}
        </p>
        {reducedMotion ? (
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-14 text-lg font-bold"
            onClick={() => setNow(Date.now())}
          >
            Cập nhật giờ
          </Button>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Giờ tính tiền</p>
        <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {hours} giờ
        </p>
        <p className="text-xs text-muted-foreground">
          Tính tròn giờ · giờ đầu tính ngay khi mở phòng. Tiền chỉ hiện khi thanh toán.
        </p>
      </div>
    </div>
  );
}
