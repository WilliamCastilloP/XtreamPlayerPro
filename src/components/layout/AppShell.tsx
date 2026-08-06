"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CatalogSplash } from "@/components/brand/CatalogSplash";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  hasFullCatalogCached,
  hydrateCatalogCache,
  preloadFullCatalog,
} from "@/lib/xtream/catalog-cache";
import { AppTopBar } from "./AppTopBar";

/** One full color+shine cycle (~3s). Keep splash at least this long. */
const MIN_SPLASH_MS = 3000;
const SPLASH_OUT_MS = 700;
/** Preview: a few loops then fade out. */
const PREVIEW_MS = 9000;

type BootPhase = "checking" | "splash" | "leaving" | "ready";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, activePlaylist, credentials } = usePlaylists();
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [bootPhase, setBootPhase] = useState<BootPhase>("checking");
  const [previewing, setPreviewing] = useState(false);
  const [previewExiting, setPreviewExiting] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewTimers = useRef<number[]>([]);
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

  const clearPreviewTimers = () => {
    for (const id of previewTimers.current) window.clearTimeout(id);
    previewTimers.current = [];
  };

  const replaySplash = useCallback(() => {
    clearPreviewTimers();
    setPreviewExiting(false);
    setPreviewing(true);
    setPreviewKey((k) => k + 1);

    const leaveId = window.setTimeout(() => {
      setPreviewExiting(true);
      const doneId = window.setTimeout(() => {
        setPreviewing(false);
        setPreviewExiting(false);
      }, SPLASH_OUT_MS);
      previewTimers.current.push(doneId);
    }, PREVIEW_MS);
    previewTimers.current.push(leaveId);
  }, []);

  useEffect(() => () => clearPreviewTimers(), []);

  // First visit (cold catalog): looping splash until catalog is persisted.
  useEffect(() => {
    if (!ready || !activePlaylist || !credentials) {
      setBootPhase("checking");
      return;
    }

    let cancelled = false;
    const creds = credentials;
    setBootPhase("checking");

    void (async () => {
      const cached = await hasFullCatalogCached(creds);
      if (cancelled) return;

      if (cached) {
        await hydrateCatalogCache(creds);
        if (!cancelled) setBootPhase("ready");
        return;
      }

      setBootPhase("splash");
      const started = Date.now();

      try {
        await preloadFullCatalog(creds);
      } catch {
        /* pages can retry individual loads */
      }

      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - started));
      if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
      if (cancelled) return;

      setBootPhase("leaving");
      window.setTimeout(() => {
        if (!cancelled) setBootPhase("ready");
      }, SPLASH_OUT_MS);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    activePlaylist?.id,
    credentials?.serverUrl,
    credentials?.username,
  ]);

  if (!ready || !activePlaylist) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[var(--xp-muted)]">
        Loading…
      </div>
    );
  }

  const showSplash =
    bootPhase === "checking" ||
    bootPhase === "splash" ||
    bootPhase === "leaving";
  const appVisible = bootPhase === "ready" || bootPhase === "leaving";

  if (showSplash && !appVisible) {
    return <CatalogSplash />;
  }

  const hideChrome = pathname.startsWith("/watch");
  const underHeader =
    isHome || /^\/(series|movies|live)\/[^/]+\/?$/.test(pathname);
  const padTop = underHeader
    ? "pt-0"
    : "pt-[calc(env(safe-area-inset-top)+6.75rem)] md:pt-20";

  const app = hideChrome ? (
    <>{children}</>
  ) : (
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      <AppTopBar scrolled={scrolled} onReplaySplash={replaySplash} />
      <main className={`min-w-0 flex-1 overflow-x-hidden ${padTop}`}>
        {children}
      </main>
    </div>
  );

  return (
    <>
      {app}
      {showSplash ? <CatalogSplash exiting /> : null}
      {previewing ? (
        <CatalogSplash key={previewKey} exiting={previewExiting} />
      ) : null}
    </>
  );
}
