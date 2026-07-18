"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  Heart,
  Home,
  Radio,
  Search,
  Tv2,
  UserRound,
} from "lucide-react";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/movies", label: "Movies", icon: Clapperboard },
  { href: "/series", label: "Series", icon: Tv2 },
  { href: "/search", label: "Search", icon: Search },
  { href: "/favorites", label: "Favorites", icon: Heart },
  { href: "/account", label: "Account", icon: UserRound },
];

export function SideRail() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-[var(--xp-border)] bg-[rgba(11,15,20,0.7)] px-3 py-6 md:flex md:flex-col">
      <Link href="/" className="mb-8 px-3">
        <p className="font-[family-name:var(--xp-font-display)] text-xl font-bold tracking-tight text-[var(--xp-text)]">
          Xtream<span className="text-[var(--xp-accent)]">Player</span>Pro
        </p>
      </Link>
      <nav className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
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
