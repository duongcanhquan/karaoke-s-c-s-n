"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeRoomMinibar, saveRoomMinibar } from "@/app/actions/minibar";
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
import { selectClass } from "@/lib/field-class";

export type MinibarRoom = { id: string; name: string };
export type MinibarProduct = { id: string; name: string };
export type MinibarSetup = {
  id: string;
  roomName: string;
  productName: string;
  defaultQuantity: number;
};

export function MinibarBoard({
  rooms,
  products,
  setups,
}: {
  rooms: MinibarRoom[];
  products: MinibarProduct[];
  setups: MinibarSetup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ready = rooms.length > 0 && products.length > 0;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Gán minibar</CardTitle>
          <CardDescription>
            Số lượng này vào hóa đơn khi mở phòng. Chỉ hiện món đã bật tủ minibar.
          </CardDescription>
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
                const result = await saveRoomMinibar({
                  roomId: String(data.get("roomId") ?? ""),
                  productId: String(data.get("productId") ?? ""),
                  defaultQuantity: Number(data.get("defaultQuantity")),
                });
                if (!result.ok) {
                  setError(result.error);
                  toast.add({ title: "Không thực hiện được", description: result.error, type: "error" });
                  return;
                }
                form.reset();
                toast.add({ title: "Đã gán minibar", type: "success" });
                router.refresh();
              });
            }}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="minibar-room" className="text-sm font-medium">
                Phòng <span aria-hidden="true">*</span>
              </label>
              <select
                id="minibar-room"
                name="roomId"
                required
                defaultValue=""
                disabled={!ready || pending}
                className={selectClass}
              >
                <option value="" disabled>
                  {rooms.length === 0 ? "Chưa có phòng" : "Chọn phòng"}
                </option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="minibar-product" className="text-sm font-medium">
                Món <span aria-hidden="true">*</span>
              </label>
              <select
                id="minibar-product"
                name="productId"
                required
                defaultValue=""
                disabled={!ready || pending}
                className={selectClass}
              >
                <option value="" disabled>
                  {products.length === 0 ? "Chưa có món minibar" : "Chọn món"}
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="minibar-qty" className="text-sm font-medium">
                Số lượng mặc định <span aria-hidden="true">*</span>
              </label>
              <Input
                id="minibar-qty"
                name="defaultQuantity"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                required
                className="min-h-11"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="min-h-11" disabled={pending || !ready}>
              {pending ? "Đang lưu" : "Lưu số lượng"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tủ minibar theo phòng</CardTitle>
          <CardDescription>
            Gán lại cùng phòng và món để đổi số lượng. Phòng đang mở không đổi hóa đơn hiện tại.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {setups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa gán món minibar cho phòng nào.</p>
          ) : (
            <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phòng</TableHead>
                  <TableHead>Món</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead>Gỡ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setups.map((setup) => (
                  <TableRow key={setup.id}>
                    <TableCell>{setup.roomName}</TableCell>
                    <TableCell>{setup.productName}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {setup.defaultQuantity}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          startTransition(async () => {
                            const result = await removeRoomMinibar(setup.id);
                            if (!result.ok) {
                              setError(result.error);
                              toast.add({
                                title: "Không thực hiện được",
                                description: result.error,
                                type: "error",
                              });
                              return;
                            }
                            toast.add({ title: "Đã gỡ khỏi phòng", type: "success" });
                            router.refresh();
                          });
                        }}
                      >
                        Gỡ
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
    </div>
  );
}
