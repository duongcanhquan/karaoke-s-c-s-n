"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

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
            Nhập đúng tên và mã PIN đã đăng ký. Thu ngân / phục vụ vào quầy. Quản lý vào bảng điều khiển.
          </p>
        </div>
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
          {pending ? "Đang vào" : "Vào ca"}
        </Button>
      </form>
    </main>
  );
}
