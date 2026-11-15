import { NextResponse, type NextRequest } from "next/server";
import {
  decodeSession,
  homeForRole,
  isWorkMode,
  SESSION_COOKIE,
  WORK_MODE_COOKIE,
} from "@/lib/session";

/**
 * Auth is the custom SESSION_COOKIE (PIN login), not Supabase Auth.
 * Skipping supabase.auth.getClaims() removes a network round-trip on every navigation.
 */
export async function proxy(request: NextRequest) {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const path = request.nextUrl.pathname;

  function redirectTo(target: string) {
    const url = request.nextUrl.clone();
    const parsed = new URL(target, request.nextUrl.origin);
    url.pathname = parsed.pathname;
    url.search = parsed.search;
    return NextResponse.redirect(url);
  }

  if (path === "/hr" || path.startsWith("/hr/")) return redirectTo("/admin/hr");
  if (path === "/expenses" || path.startsWith("/expenses/")) {
    return redirectTo("/admin/finance?tab=expenses");
  }
  if (path === "/inventory" || path.startsWith("/inventory/")) {
    return redirectTo("/admin/catalog?tab=inventory");
  }
  if (path === "/admin/rooms" || path.startsWith("/admin/rooms/")) {
    return redirectTo("/admin/setup");
  }
  if (path === "/admin/minibar" || path.startsWith("/admin/minibar/")) {
    return redirectTo("/admin/setup?tab=minibar");
  }
  if (path === "/admin/revenue" || path.startsWith("/admin/revenue/")) {
    return redirectTo("/admin/finance");
  }
  if (path === "/admin/expenses" || path.startsWith("/admin/expenses/")) {
    return redirectTo("/admin/finance?tab=expenses");
  }
  if (path === "/admin/summary" || path.startsWith("/admin/summary/")) {
    return redirectTo("/admin/finance?tab=summary");
  }
  if (path === "/admin/products" || path.startsWith("/admin/products/")) {
    return redirectTo("/admin/catalog");
  }
  if (path === "/admin/inventory" || path.startsWith("/admin/inventory/")) {
    return redirectTo("/admin/catalog?tab=inventory");
  }

  if (!session && path !== "/") return redirectTo("/");
  if (session && path === "/") {
    const preferred = request.cookies.get(WORK_MODE_COOKIE)?.value;
    return redirectTo(
      homeForRole(session.role, isWorkMode(preferred) ? preferred : null),
    );
  }
  // Quản lý được vào cả /admin và /pos. Role khác chỉ quầy.
  if (session && session.role !== "ADMIN" && path.startsWith("/admin")) {
    return redirectTo("/pos");
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
