import { Suspense } from "react";
import { RoomBoard, type AdminRoom } from "@/components/admin/room-board";
import { LoadError } from "@/components/load-error";
import { createClient } from "@/utils/supabase/server";

async function RoomsContent() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, type, hourly_rate, status")
    .order("name");

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <LoadError message={error.message} />
        <RoomBoard rooms={[]} />
      </div>
    );
  }

  const rooms: AdminRoom[] = (data ?? []).map((room) => ({
    id: String(room.id),
    name: String(room.name),
    type: String(room.type),
    hourlyRate: Number(room.hourly_rate),
    status: String(room.status),
  }));

  return <RoomBoard rooms={rooms} />;
}

export default function RoomsPage() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Phòng</h1>
        <p className="text-sm text-muted-foreground">Thêm phòng và theo dõi trạng thái.</p>
      </div>
      <Suspense fallback={<div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true" />}>
        <RoomsContent />
      </Suspense>
    </section>
  );
}
