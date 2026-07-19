"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { useLocale } from "@/components/providers/LocaleProvider";

export function SideRail() {
  const pathname = usePathname();
  const { t } = useLocale();

  const items = [
    { href: "/", label: t("navHome"), icon: Home },
    { href: "/search", label: t("navSearch"), icon: Search },
    { href: "/account", label: t("navAccount"), icon: UserRound },
  ];

  return (
    <aside className="hidden w-56 shrink-0 border-r border-[var(--xp-border)] bg-[rgba(11,15,20,0.7)] px-3 py-6 md:flex md:flex-col">
      <div className="mb-8 px-3">
        <BrandMark size="md" />
      </div>
      <nav className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" ||
                pathname.startsWith("/live") ||
                pathname.startsWith("/movies") ||
                pathname.startsWith("/series") ||
                pathname.startsWith("/browse")
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-[var(--xp-accent-dim)] text-[var(--xp-accent)]"
                  : "text-[var(--xp-muted)] hover:bg-[var(--xp-surface)] hover:text-[var(--xp-text)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
