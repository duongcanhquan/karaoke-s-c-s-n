"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ManagerPinDialog({
  open,
  onOpenChange,
  pending,
  title = "Mã PIN quản lý",
  description = "Xóa hoặc giảm món trên hóa đơn cần mã PIN quản lý.",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  title?: string;
  description?: string;
  onConfirm: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPin("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-2 text-base font-medium">
          Mã PIN
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            className="min-h-14 text-center text-2xl font-bold tracking-[0.35em]"
            onKeyDown={(event) => {
              if (event.key === "Enter" && pin.trim()) onConfirm(pin.trim());
            }}
          />
        </label>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="h-14 w-full text-xl font-bold"
            disabled={pending || !pin.trim()}
            onClick={() => onConfirm(pin.trim())}
          >
            Xác nhận
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full text-base font-bold"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
