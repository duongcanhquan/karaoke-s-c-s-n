"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { estimatedRoomCost, formatElapsed, formatVnd } from "@/lib/money";

export function ElapsedClock({
  startTime,
  hourlyRate,
}: {
  startTime: string;
  hourlyRate: number;
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
  const estimate = estimatedRoomCost(startTime, hourlyRate, now);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs text-muted-foreground">Thời gian</p>
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
        <p className="text-xs text-muted-foreground">Tiền phòng tạm tính</p>
        <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
          {formatVnd(estimate)}
        </p>
        <p className="text-xs text-muted-foreground">
          Chỉ ghi vào hóa đơn khi thanh toán.
        </p>
      </div>
    </div>
  );
}
