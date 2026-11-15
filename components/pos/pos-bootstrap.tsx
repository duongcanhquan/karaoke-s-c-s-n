"use client";

import { useEffect, useState } from "react";
import { PosKiosk, type PosBill } from "@/components/pos/pos-kiosk";
import { PosSkeleton } from "@/components/page-skeleton";
import {
  invalidatePosClientCache,
  loadPosSnapshot,
} from "@/lib/pos-client-data";
import type { Product, Room, RoomSetupItem, StaffOption } from "@/lib/pos-types";

export function PosBootstrap({
  cashierName,
  canManage = false,
}: {
  cashierName: string;
  canManage?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [bills, setBills] = useState<Record<string, PosBill>>({});
  const [roomSetups, setRoomSetups] = useState<Record<string, RoomSetupItem[]>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate(force = false) {
      try {
        const snapshot = await loadPosSnapshot(force);
        if (cancelled) return;
        setRooms(snapshot.rooms);
        setProducts(snapshot.products);
        setStaff(snapshot.staff);
        setBills(snapshot.bills);
        setRoomSetups(snapshot.roomSetups);
        setError(null);
        setReady(true);

        // Stale-while-revalidate: if we painted from memory, refresh once in background.
        if (!force && Date.now() - snapshot.fetchedAt > 200) {
          void hydrate(true);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Không tải được quầy.");
        setReady(true);
      }
    }

    void hydrate(false);

    function onVisible() {
      if (document.visibilityState === "visible") {
        invalidatePosClientCache();
        void hydrate(true);
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!ready) return <PosSkeleton />;

  if (error && rooms.length === 0) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center p-6">
        <p role="alert" className="max-w-lg text-xl text-destructive">
          {error}
        </p>
      </div>
    );
  }

  return (
    <PosKiosk
      cashierName={cashierName}
      canManage={canManage}
      rooms={rooms}
      products={products}
      staff={staff}
      bills={bills}
      roomSetups={roomSetups}
    />
  );
}
