"use client";

import { useState, useTransition } from "react";
import { createRoom, deleteRoom } from "@/app/actions/rooms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatVnd } from "@/lib/money";
import { labelRoomStatus } from "@/lib/room-status";

export type AdminRoom = {
  id: string;
  name: string;
  type: string;
  hourlyRate: number;
  status: string;
};

export function RoomBoard({ rooms }: { rooms: AdminRoom[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminRoom | null>(null);
  const [deletePin, setDeletePin] = useState("");

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Thêm phòng</CardTitle>
          <CardDescription>Phòng mới luôn ở trạng thái Trống.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              setError(null);
              startTransition(async () => {
                const result = await createRoom({
                  name: String(data.get("name") ?? ""),
                  type: String(data.get("type") ?? ""),
                  hourlyRate: Number(data.get("hourlyRate")),
                });
                if (!result.ok) {
                  setError(result.error);
                  toast.add({ title: "Không thực hiện được", description: result.error, type: "error" });
                  return;
                }
                form.reset();
                toast.add({ title: "Đã thêm phòng", type: "success" });
              });
            }}
          >
            <label htmlFor="room-name" className="flex flex-col gap-1 text-sm font-medium">
              Tên <span aria-hidden="true">*</span>
              <Input id="room-name" name="name" required className="min-h-11" />
            </label>
            <label htmlFor="room-type" className="flex flex-col gap-1 text-sm font-medium">
              Loại <span aria-hidden="true">*</span>
              <Input id="room-type" name="type" required defaultValue="VIP" className="min-h-11" />
            </label>
            <label htmlFor="room-rate" className="flex flex-col gap-1 text-sm font-medium">
              Giá giờ <span aria-hidden="true">*</span>
              <Input id="room-rate" name="hourlyRate" type="number" min="0" step="1" required className="min-h-11" />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? "Đang lưu…" : "Lưu phòng"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách phòng</CardTitle>
          <CardDescription>{rooms.length} phòng</CardDescription>
        </CardHeader>
        <CardContent>
          {rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có phòng.</p>
          ) : (
            <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phòng</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Giá giờ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Xóa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell>{room.name}</TableCell>
                    <TableCell>{room.type}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatVnd(room.hourlyRate)}
                    </TableCell>
                    <TableCell>{labelRoomStatus(room.status)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={pending || room.status !== "AVAILABLE"}
                        onClick={() => {
                          setError(null);
                          setDeletePin("");
                          setRemoving(room);
                        }}
                      >
                        Xóa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {removing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-xl font-bold text-slate-950">Xóa {removing.name}?</p>
            <p className="mt-1 text-sm text-slate-600">Cần mã PIN quản lý. Chỉ xóa được phòng đang trống.</p>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="PIN quản lý"
              value={deletePin}
              onChange={(event) => setDeletePin(event.target.value)}
              className="mt-4 min-h-12 text-center text-xl font-bold tracking-[0.3em]"
            />
            {error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                variant="destructive"
                className="min-h-12"
                disabled={pending || !deletePin.trim()}
                onClick={() => {
                  const target = removing;
                  startTransition(async () => {
                    const result = await deleteRoom(target.id, deletePin.trim());
                    if (!result.ok) {
                      setError(result.error);
                      toast.add({
                        title: "Không thực hiện được",
                        description: result.error,
                        type: "error",
                      });
                      return;
                    }
                    setRemoving(null);
                    setDeletePin("");
                    toast.add({ title: "Đã xóa phòng", type: "success" });
                  });
                }}
              >
                Xóa phòng
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={() => {
                  setRemoving(null);
                  setDeletePin("");
                  setError(null);
                }}
              >
                Hủy
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
