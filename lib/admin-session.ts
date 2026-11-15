import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  decodeSession,
  type SessionUser,
} from "@/lib/session";

/** Gate admin Server Actions — page proxy alone is not enough. */
export async function requireAdminSession(): Promise<
  { ok: true; session: SessionUser } | { ok: false; error: string }
> {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session || session.role !== "ADMIN") {
    return { ok: false, error: "Chỉ quản lý mới được thao tác." };
  }
  return { ok: true, session };
}
