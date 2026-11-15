import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE, type SessionUser } from "@/lib/session";

/** Tiny cookie read — keep outside heavy data fetches. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}
