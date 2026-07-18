"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand/BrandMark";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, activePlaylist } = usePlaylists();
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!activePlaylist) {
      router.replace("/playlists");
    }
  }, [ready, activePlaylist, router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!ready || !activePlaylist) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[var(--xp-muted)]">
        Loading…
      </div>
    );
  }

  const hideChrome = pathname.startsWith("/watch");

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh">
      <SideRail />
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header
          className={`sticky top-0 z-30 px-4 py-3 transition-[background,box-shadow] duration-300 md:hidden ${
            scrolled
              ? "bg-[rgba(11,15,20,0.92)] shadow-[0_12px_28px_rgba(0,0,0,0.55)] backdrop-blur-xl"
              : "bg-transparent"
          }`}
        >
          {/* Fade veil so content vanishes under the header while scrolling */}
          <div
            className={`pointer-events-none absolute inset-x-0 top-full h-10 bg-gradient-to-b from-[rgba(11,15,20,0.9)] to-transparent transition-opacity duration-300 ${
              scrolled ? "opacity-100" : "opacity-0"
            }`}
          />
          <div className="relative flex items-center justify-between">
            <BrandMark size="sm" />
            <span className="max-w-[42%] truncate rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-[var(--xp-muted)]">
              {activePlaylist.name}
            </span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
