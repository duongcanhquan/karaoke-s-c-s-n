"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MicVocal,
  Package,
  Receipt,
  Users,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS", icon: MicVocal },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/admin/products", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/minibar", label: "Minibar", icon: Wine },
  { href: "/hr", label: "HR", icon: Users },
  { href: "/expenses", label: "Expenses", icon: Receipt },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col bg-background md:flex-row">
      <aside className="border-b border-border bg-card md:w-60 md:border-r md:border-b-0">
        <div className="px-5 py-6">
          <p className="font-heading text-3xl leading-none text-primary">Karaoke</p>
          <span aria-hidden="true" className="mt-3 block h-0.5 w-10 rounded-full bg-gold" />
          <p className="mt-3 text-sm text-muted-foreground">Quầy quản lý</p>
        </div>
        <nav aria-label="Chính" className="flex flex-wrap gap-1 px-3 pb-4 md:flex-col md:px-3 md:pb-6">
          {links.map((link) => {
            const current = isCurrent(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
