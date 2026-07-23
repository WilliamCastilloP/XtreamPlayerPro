"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { AppTopBar } from "./AppTopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, activePlaylist } = usePlaylists();
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const isHome = pathname === "/";

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

  // Home + title detail: hero sits under transparent header.
  const underHeader =
    isHome || /^\/(series|movies|live)\/[^/]+\/?$/.test(pathname);
  const padTop = underHeader
    ? "pt-0"
    : "pt-[calc(env(safe-area-inset-top)+6.75rem)] md:pt-20";

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopBar scrolled={scrolled} />
      <main className={`flex-1 ${padTop}`}>{children}</main>
    </div>
  );
}
