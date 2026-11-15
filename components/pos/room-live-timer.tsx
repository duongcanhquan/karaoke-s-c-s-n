"use client";

import { useEffect, useState } from "react";
import { billableHours, formatElapsed, formatVnd } from "@/lib/money";

/** Local-only clock for one room card / sheet — avoids re-rendering the whole POS. */
export function RoomLiveTimer({
  startTime,
  hourlyRate,
  variant = "card",
}: {
  startTime: string;
  hourlyRate: number;
  variant?: "card" | "banner";
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = formatElapsed(startTime, now);
  const hours = billableHours(startTime, now);

  if (variant === "banner") {
    return (
      <>
        <p className="mt-2 font-mono text-4xl font-bold tabular-nums">{elapsed}</p>
        <p className="mt-3 text-lg font-semibold">Giờ tính: {hours} giờ</p>
        <p className="mt-1 text-sm opacity-90">Tiền chỉ tính khi bấm Thanh toán</p>
      </>
    );
  }

  return (
    <>
      <p className="mt-auto font-mono text-4xl font-bold tabular-nums md:text-5xl">{elapsed}</p>
      <p className="text-base font-semibold md:text-lg">
        Giờ tính: {hours} giờ · {formatVnd(hourlyRate)}/giờ
      </p>
    </>
  );
}
