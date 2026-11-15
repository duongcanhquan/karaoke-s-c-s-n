"use client";

import { useState, useTransition } from "react";
import { createRoom, deleteRoom, updateRoom } from "@/app/actions/rooms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { adminFieldClass } from "@/lib/admin-ui";
import { formatVnd } from "@/lib/money";
import { labelRoomStatus } from "@/lib/room-status";

export type AdminRoom = {
  id: string;
  name: string;
  type: string;
  hourlyRate: number;
  status: string;
};

const fieldClass = adminFieldClass;

function RoomFields({
  idPrefix,
  room,
}: {
  idPrefix: string;
  room?: AdminRoom;
}) {
  return (
    <>
      <label htmlFor={`${idPrefix}-name`} className="flex flex-col gap-1 text-sm font-medium">
        Tên <span aria-hidden="true">*</span>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          defaultValue={room?.name}
          className={fieldClass}
        />
      </label>
      <label htmlFor={`${idPrefix}-type`} className="flex flex-col gap-1 text-sm font-medium">
        Loại <span aria-hidden="true">*</span>
        <Input
          id={`${idPrefix}-type`}
          name="type"
          required
          defaultValue={room?.type ?? "VIP"}
          className={fieldClass}
        />
      </label>
      <label htmlFor={`${idPrefix}-rate`} className="flex flex-col gap-1 text-sm font-medium">
        Giá giờ <span aria-hidden="true">*</span>
        <Input
          id={`${idPrefix}-rate`}
          name="hourlyRate"
          type="number"
          min="0"
          step="1"
          required
          defaultValue={room?.hourlyRate}
          className={fieldClass}
        />
      </label>
    </>
  );
}

function readRoom(data: FormData) {
  return {
    name: String(data.get("name") ?? ""),
    type: String(data.get("type") ?? ""),
    hourlyRate: Number(data.get("hourlyRate")),
  };
}

export function RoomBoard({ rooms }: { rooms: AdminRoom[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminRoom | null>(null);
  const [removing, setRemoving] = useState<AdminRoom | null>(null);
  const [deletePin, setDeletePin] = useState("");

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        toast.add({
          title: "Không thực hiện được",
          description: result.error,
          type: "error",
        });
        return;
      }
      toast.add({ title: success, type: "success" });
      after?.();
    });
  }

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
              const input = readRoom(new FormData(form));
              run(() => createRoom(input), "Đã thêm phòng", () => form.reset());
            }}
          >
            <RoomFields idPrefix="create" />
            {error && !editing && !removing ? (
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
                    <TableHead>Thao tác</TableHead>
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={pending}
                            onClick={() => {
                              setError(null);
                              setEditing(room);
                            }}
                          >
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-full overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa {editing?.name}</DialogTitle>
            <DialogDescription>
              Đổi tên, loại hoặc giá giờ. Trạng thái phòng vẫn do quầy thu ngân quản lý.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              key={editing.id}
              className="flex w-full flex-col gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const id = editing.id;
                const input = readRoom(new FormData(event.currentTarget));
                run(() => updateRoom({ id, ...input }), "Đã cập nhật phòng", () =>
                  setEditing(null),
                );
              }}
            >
              <RoomFields idPrefix="edit" room={editing} />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setEditing(null)}
                >
                  Hủy
                </Button>
                <Button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? "Đang lưu" : "Lưu"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setDeletePin("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa {removing?.name}?</DialogTitle>
            <DialogDescription>
              Cần mã PIN quản lý. Chỉ xóa được phòng đang trống.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="PIN quản lý"
            value={deletePin}
            onChange={(event) => setDeletePin(event.target.value)}
            className="min-h-12 text-center text-xl font-bold tracking-[0.3em]"
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setRemoving(null);
                setDeletePin("");
                setError(null);
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending || !removing || !deletePin.trim()}
              onClick={() => {
                if (!removing) return;
                const pin = deletePin.trim();
                run(
                  () => deleteRoom(removing.id, pin),
                  "Đã xóa phòng",
                  () => {
                    setRemoving(null);
                    setDeletePin("");
                  },
                );
              }}
            >
              Xóa phòng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
