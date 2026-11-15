"use client";

import { useTransition } from "react";
import { switchWorkMode } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export function WorkModeSwitch({
  mode,
  className,
  label,
}: {
  mode: "pos" | "admin";
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const text =
    label ?? (mode === "pos" ? "Quầy thu ngân" : "Quản trị");

  return (
    <Button
      type="button"
      variant={mode === "pos" ? "default" : "outline"}
      className={cn("min-h-11 font-semibold", className)}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await switchWorkMode(mode);
        });
      }}
    >
      {pending ? "Đang chuyển…" : text}
    </Button>
  );
}
