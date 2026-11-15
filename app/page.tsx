"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  const [destination, setDestination] = useState<"pos" | "admin">("pos");

  return (
    <main className="flex h-dvh w-screen items-center justify-center bg-background px-4">
      <form
        action={action}
        className="flex w-full max-w-md flex-col gap-5 rounded-3xl bg-card p-8 shadow-sm ring-1 ring-border"
      >
        <div>
          <p className="font-heading text-4xl text-primary">Karaoke</p>
          <span aria-hidden="true" className="mt-3 block h-0.5 w-12 rounded-full bg-gold" />
          <h1 className="mt-4 text-2xl">Đăng nhập ca</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Quản lý vừa làm quầy vừa vào quản trị. Thu ngân / phục vụ vào quầy. Ví dụ quản lý:{" "}
            <span className="font-semibold text-foreground">Quanly</span> /{" "}
            <span className="font-semibold text-foreground">1234</span>.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-lg font-medium">Vào màn hình</legend>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={destination === "pos" ? "default" : "outline"}
              className="min-h-14 text-base font-bold"
              disabled={pending}
              onClick={() => setDestination("pos")}
            >
              Quầy thu ngân
            </Button>
            <Button
              type="button"
              variant={destination === "admin" ? "default" : "outline"}
              className="min-h-14 text-base font-bold"
              disabled={pending}
              onClick={() => setDestination("admin")}
            >
              Quản lý
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {destination === "pos"
              ? "Mở phòng, gọi món, thu tiền — quản lý cũng dùng được."
              : "Chỉ tài khoản Quản lý mới vào được màn hình quản trị."}
          </p>
          <input type="hidden" name="destination" value={destination} />
        </fieldset>

        <label htmlFor="name" className="flex flex-col gap-2 text-lg font-medium">
          Tên
          <Input
            id="name"
            name="name"
            required
            autoComplete="username"
            className="h-14 min-h-14 text-xl md:text-xl"
          />
        </label>
        <label htmlFor="pin" className="flex flex-col gap-2 text-lg font-medium">
          Mã PIN
          <Input
            id="pin"
            name="pin"
            required
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            className="h-16 min-h-16 text-2xl tracking-[0.3em] md:text-2xl"
          />
        </label>
        {state?.error ? (
          <p role="alert" className="text-base text-destructive">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="min-h-16 text-xl" disabled={pending}>
          {pending
            ? "Đang vào"
            : destination === "pos"
              ? "Vào quầy"
              : "Vào quản lý"}
        </Button>
      </form>
    </main>
  );
}
