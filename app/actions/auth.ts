"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  SESSION_COOKIE,
  encodeSession,
  homeForRole,
  isStaffRole,
  type SessionUser,
} from "@/lib/session";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 12,
};

export async function login(
  _previous: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const pin = String(formData.get("pin") ?? "").trim();
  if (!pin) return { error: "Nhập mã PIN." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("pin_code", pin)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Sai mã PIN." };

  const role = String(data.role);
  if (!isStaffRole(role)) {
    return {
      error: "Tài khoản cần vai trò Quản lý, Thu ngân hoặc Nhân viên phục vụ.",
    };
  }

  const session: SessionUser = {
    id: String(data.id),
    name: String(data.name),
    role,
  };
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(session), cookieOptions);
  redirect(homeForRole(role));
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/");
}
