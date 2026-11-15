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

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function login(
  _previous: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const name = normalizeName(String(formData.get("name") ?? ""));
  const pin = String(formData.get("pin") ?? "").trim();

  if (!name) return { error: "Nhập tên đăng nhập." };
  if (!pin) return { error: "Nhập mã PIN." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, pin_code")
    .eq("pin_code", pin)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Sai tên hoặc mã PIN." };

  const storedName = normalizeName(String(data.name));
  if (storedName.localeCompare(name, "vi", { sensitivity: "accent" }) !== 0) {
    return { error: "Sai tên hoặc mã PIN." };
  }

  const role = String(data.role);
  if (!isStaffRole(role)) {
    return {
      error: "Tài khoản cần vai trò Quản lý, Thu ngân hoặc Nhân viên phục vụ.",
    };
  }

  const session: SessionUser = {
    id: String(data.id),
    name: storedName,
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
