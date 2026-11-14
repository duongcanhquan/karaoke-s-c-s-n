import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, homeForRole, SESSION_COOKIE } from "@/lib/session";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Refreshes the auth cookie. Do not add logic between creating the client
  // and this call, or the refreshed cookie can be dropped.
  await supabase.auth.getClaims();

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const path = request.nextUrl.pathname;

  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  if (path === "/hr" || path.startsWith("/hr/")) return redirectTo("/admin/hr");
  if (path === "/expenses" || path.startsWith("/expenses/")) return redirectTo("/admin/expenses");
  if (path === "/inventory" || path.startsWith("/inventory/")) return redirectTo("/admin/inventory");

  if (!session && path !== "/") return redirectTo("/");
  if (session && path === "/") return redirectTo(homeForRole(session.role));
  if (session && session.role !== "ADMIN" && path.startsWith("/admin")) return redirectTo("/pos");

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
