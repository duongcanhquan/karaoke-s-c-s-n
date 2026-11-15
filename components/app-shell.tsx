"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { WorkModeSwitch } from "@/components/work-mode-switch";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CircleDollarSign,
  DoorOpen,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageSkeleton } from "@/components/page-skeleton";
import { cn } from "cn";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/finance", label: "Tài chính", icon: CircleDollarSign },
  { href: "/admin/catalog", label: "Hàng hóa", icon: Package },
  { href: "/admin/setup", label: "Setup phòng", icon: DoorOpen },
  { href: "/admin/hr", label: "Nhân viên", icon: Users },
  { href: "/admin/settings", label: "Cài đặt", icon: Settings },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <div className="px-5 py-6">
      <p className="font-heading text-3xl leading-none text-primary">Karaoke</p>
      <span aria-hidden="true" className="mt-3 block h-0.5 w-10 rounded-full bg-gold" />
      <p className="mt-3 text-sm text-muted-foreground">Quản trị</p>
    </div>
  );
}

function NavLinks({
  pathname,
  pendingHref,
  onNavigate,
}: {
  pathname: string;
  pendingHref: string | null;
  onNavigate: (href: string) => void;
}) {
  return (
    <nav aria-label="Chính" className="flex flex-col gap-1 px-3 pb-6">
      {links.map((link) => {
        const current = isCurrent(pathname, link.href);
        const pending = pendingHref === link.href;
        // Pending target looks selected immediately so the click feels instant.
        const selected = pending || (current && !pendingHref);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            aria-current={selected ? "page" : undefined}
            aria-busy={pending || undefined}
            onClick={(event) => {
              // Soft client nav via transition — keeps shell interactive while RSC streams.
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.altKey ||
                event.ctrlKey ||
                event.shiftKey
              ) {
                return;
              }
              event.preventDefault();
              onNavigate(link.href);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {link.label}
            {pending ? (
              <span
                aria-hidden="true"
                className="ml-auto size-4 rounded-full border-2 border-primary-foreground border-t-transparent motion-safe:animate-spin"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton() {
  return (
    <form action={logout} className="mt-auto px-3 py-4">
      <Button type="submit" variant="outline" className="min-h-11 w-full">
        Đăng xuất
      </Button>
    </form>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (pendingHref && isCurrent(pathname, pendingHref)) {
    setPendingHref(null);
  }

  useEffect(() => {
    // Warm every admin route + POS as soon as shell mounts.
    for (const link of links) {
      router.prefetch(link.href);
    }
    router.prefetch("/pos");
    router.prefetch("/admin/catalog?tab=inventory");
    router.prefetch("/admin/finance?tab=expenses");
    router.prefetch("/admin/finance?tab=summary");
    router.prefetch("/admin/setup?tab=minibar");
    router.prefetch("/admin/hr?tab=shifts");
    router.prefetch("/admin/hr?tab=payroll");
    router.prefetch("/admin/settings?tab=bank");
    router.prefetch("/admin/settings?tab=printer");
    // Warm POS room data in parallel so opening the kiosk is instant.
    void import("@/lib/pos-client-data").then((mod) => {
      void mod.loadPosSnapshot(false);
    });
  }, [router]);

  function handleNavigate(href: string) {
    setMenuOpen(false);
    if (href === pathname) return;
    // Paint loading UI on the same click tick — don't wait for RSC.
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  const navigating = Boolean(pendingHref && !isCurrent(pathname, pendingHref));

  return (
    <div className="flex min-h-dvh flex-col bg-background md:flex-row">
      {navigating ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-muted"
        >
          <div className="admin-nav-progress h-full w-1/2 bg-primary" />
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex md:min-h-dvh">
        <Brand />
        <NavLinks
          pathname={pathname}
          pendingHref={pendingHref}
          onNavigate={handleNavigate}
        />
        <div className="flex flex-col gap-2 px-3 pb-2">
          <WorkModeSwitch mode="pos" className="w-full" label="Chuyển ra quầy thu ngân" />
        </div>
        <LogoutButton />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center gap-2 border-b border-border bg-card px-4 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11 shrink-0"
            aria-label="Mở menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-xl leading-none text-primary">Karaoke</p>
            <p className="truncate text-xs text-muted-foreground">Quản trị</p>
          </div>
          <WorkModeSwitch
            mode="pos"
            className="max-w-[11rem] shrink-0 truncate px-2.5 text-xs sm:max-w-none sm:px-3 sm:text-sm"
            label="Chuyển ra quầy thu ngân"
          />
        </header>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="left"
            className="w-64 max-w-[85vw] gap-0 p-0 sm:max-w-none"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Menu quản trị</SheetTitle>
            </SheetHeader>
            <Brand />
            <NavLinks
              pathname={pathname}
              pendingHref={pendingHref}
              onNavigate={handleNavigate}
            />
            <div className="flex flex-col gap-2 px-3 pb-2">
              <WorkModeSwitch mode="pos" className="w-full" label="Chuyển ra quầy thu ngân" />
            </div>
            <LogoutButton />
          </SheetContent>
        </Sheet>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {navigating ? (
            <PageSkeleton label="Đang tải dữ liệu…" />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
