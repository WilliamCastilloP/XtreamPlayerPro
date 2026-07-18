"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, activePlaylist } = usePlaylists();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!activePlaylist) {
      router.replace("/playlists");
    }
  }, [ready, activePlaylist, router]);

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
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--xp-border)] bg-[rgba(11,15,20,0.85)] px-4 py-3 backdrop-blur-xl md:hidden">
          <p className="font-[family-name:var(--xp-font-display)] text-lg font-bold">
            Xtream<span className="text-[var(--xp-accent)]">Player</span>Pro
          </p>
          <span className="truncate text-xs text-[var(--xp-muted)]">
            {activePlaylist.name}
          </span>
        </header>
        <main className="flex-1">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
