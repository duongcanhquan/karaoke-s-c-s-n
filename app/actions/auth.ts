"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "@/utils/supabase/db";
import {
  SESSION_COOKIE,
  WORK_MODE_COOKIE,
  canAccessAdmin,
  decodeSession,
  encodeSession,
  isStaffRole,
  isWorkMode,
  resolveLoginDestination,
  type SessionUser,
  type WorkMode,
} from "@/lib/session";

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 12,
};

const modeCookieOptions = {
  httpOnly: false,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
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
  const destination = String(formData.get("destination") ?? "").trim();

  if (!name) return { error: "Nhập tên đăng nhập." };
  if (!pin) return { error: "Nhập mã PIN." };

  const supabase = createDb();
  const { data: rows, error } = await supabase
    .from("users")
    .select("id, name, role, pin_code");

  if (error) return { error: error.message };
  if (!rows?.length) {
    return {
      error:
        "Chưa có tài khoản hoặc RLS chặn đọc users. Chạy file update_admin_quanly.sql trong Supabase SQL Editor.",
    };
  }

  const data = rows.find(
    (row) =>
      normalizeName(String(row.name)).localeCompare(name, "vi", { sensitivity: "base" }) === 0 &&
      String(row.pin_code).trim() === pin,
  );
  if (!data) return { error: "Sai tên hoặc mã PIN." };

  const storedName = normalizeName(String(data.name));
  const role = String(data.role);
  if (!isStaffRole(role)) {
    return {
      error: "Tài khoản cần vai trò Quản lý, Thu ngân hoặc Nhân viên phục vụ.",
    };
  }

  const cookieStore = await cookies();
  const preferred = cookieStore.get(WORK_MODE_COOKIE)?.value;
  const routed = resolveLoginDestination(
    role,
    destination,
    isWorkMode(preferred) ? preferred : null,
  );
  if (!routed.ok) return { error: routed.error };

  const session: SessionUser = {
    id: String(data.id),
    name: storedName,
    role,
  };
  cookieStore.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions);
  cookieStore.set(WORK_MODE_COOKIE, routed.mode, modeCookieOptions);
  redirect(routed.path);
}

/** Quản lý chuyển nhanh quầy ↔ quản trị (không cần đăng nhập lại). */
export async function switchWorkMode(mode: WorkMode) {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/");

  if (mode === "admin" && !canAccessAdmin(session.role)) {
    redirect("/pos");
  }

  cookieStore.set(WORK_MODE_COOKIE, mode, modeCookieOptions);
  redirect(mode === "admin" ? "/admin" : "/pos");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/");
}
