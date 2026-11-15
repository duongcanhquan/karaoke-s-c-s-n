"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DoorOpen,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Settings,
  Users,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/products", label: "Thực đơn", icon: UtensilsCrossed },
  { href: "/admin/rooms", label: "Phòng", icon: DoorOpen },
  { href: "/admin/minibar", label: "Tủ minibar", icon: Wine },
  { href: "/admin/hr", label: "Nhân viên", icon: Users },
  { href: "/admin/inventory", label: "Kho hàng", icon: Package },
  { href: "/admin/expenses", label: "Chi phí", icon: Receipt },
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
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Chính" className="flex flex-col gap-1 px-3 pb-6">
      {links.map((link) => {
        const current = isCurrent(pathname, link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              current
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {link.label}
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-background md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex md:min-h-dvh">
        <Brand />
        <NavLinks pathname={pathname} />
        <LogoutButton />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Mở menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
          <div className="min-w-0">
            <p className="font-heading text-xl leading-none text-primary">Karaoke</p>
            <p className="truncate text-xs text-muted-foreground">Quản trị</p>
          </div>
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
            <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            <LogoutButton />
          </SheetContent>
        </Sheet>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
