"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, UserRound } from "lucide-react";
import { useLocale } from "@/components/providers/LocaleProvider";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  const items = [
    { href: "/", label: t("navHome"), icon: Home },
    { href: "/search", label: t("navSearch"), icon: Search },
    { href: "/account", label: t("navAccount"), icon: UserRound },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--xp-border)] bg-[rgba(11,15,20,0.94)] backdrop-blur-xl md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)] pt-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" ||
                pathname.startsWith("/live") ||
                pathname.startsWith("/movies") ||
                pathname.startsWith("/series") ||
                pathname.startsWith("/favorites") ||
                pathname.startsWith("/browse")
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 px-1 py-2.5 text-[11px] ${
                  active
                    ? "text-[var(--xp-accent)]"
                    : "text-[var(--xp-muted)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
