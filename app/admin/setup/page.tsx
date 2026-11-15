import { Suspense } from "react";
import { RoomBoard } from "@/components/admin/room-board";
import { MinibarBoard } from "@/components/admin/minibar-board";
import { SetupTabs } from "@/components/admin/setup-tabs";
import { LoadError } from "@/components/load-error";
import { getCachedSetupData } from "@/lib/admin-data";

async function SetupContent({ active }: { active: "rooms" | "minibar" }) {
  const data = await getCachedSetupData();

  return (
    <SetupTabs
      active={active}
      roomsPanel={
        data.roomsError ? (
          <div className="flex flex-col gap-4">
            <LoadError message={data.roomsError} />
            <RoomBoard rooms={[]} />
          </div>
        ) : (
          <RoomBoard rooms={data.rooms} />
        )
      }
      minibarPanel={
        data.minibarError ? (
          <div className="flex flex-col gap-4">
            <LoadError
              message={data.minibarError}
              hint="Chạy supabase_schema.sql rồi update_schema.sql trong Supabase."
            />
            <MinibarBoard rooms={[]} products={[]} setups={[]} />
          </div>
        ) : (
          <MinibarBoard
            rooms={data.minibarRooms}
            products={data.products}
            setups={data.setups}
          />
        )
      }
    />
  );
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const active = params.tab === "minibar" ? "minibar" : "rooms";

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Setup phòng</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý phòng karaoke và đồ setup tủ minibar trên cùng một màn hình.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-48 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true" />
        }
      >
        <SetupContent active={active} />
      </Suspense>
    </section>
  );
}
