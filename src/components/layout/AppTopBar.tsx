"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clapperboard, Search, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import type { BrowseKind } from "@/components/catalog/BrowseRails";
import { useLocale } from "@/components/providers/LocaleProvider";

type Props = {
  scrolled: boolean;
  /** Temporary: replay boot splash while tuning the animation. */
  onReplaySplash?: () => void;
};

const SECTIONS: BrowseKind[] = ["live", "movies", "series"];

/** Centered column (max 1400px). Pair with APP_GUTTER for padded content. */
export const APP_FRAME = "xp-frame";
/** Same horizontal padding as catalog rows / genre bar */
export const APP_GUTTER = "px-4 md:px-6 lg:px-8 xl:px-12";
/** Frame + gutter — use for header / page blocks that should not full-bleed */
export const APP_CONTENT = `${APP_FRAME} ${APP_GUTTER}`;

function parseSection(value: string | null): BrowseKind | null {
  if (value === "live" || value === "movies" || value === "series") return value;
  return null;
}

function sectionActive(
  id: BrowseKind,
  section: BrowseKind | null,
  pathname: string,
) {
  if (section === id) return true;
  if (id === "live") {
    return (
      pathname.startsWith("/live") || pathname.startsWith("/browse/live")
    );
  }
  if (id === "movies") {
    return (
      pathname.startsWith("/movies") || pathname.startsWith("/browse/movies")
    );
  }
  return (
    pathname.startsWith("/series") || pathname.startsWith("/browse/series")
  );
}

function AppTopBarInner({ scrolled, onReplaySplash }: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section =
    pathname === "/" ? parseSection(searchParams.get("section")) : null;
  const searchOpen = pathname.startsWith("/search");
  const accountActive = pathname.startsWith("/account");
  const isTitleDetail = /^\/(series|movies|live)\/[^/]+\/?$/.test(pathname);
  const showSections = !isTitleDetail && !searchOpen && !accountActive;

  const sectionLabel = (id: BrowseKind) =>
    id === "live" ? t("liveTv") : id === "movies" ? t("movies") : t("series");

  const setSection = (id: BrowseKind) => {
    if (pathname !== "/") {
      router.push(`/?section=${id}`);
      return;
    }
    // Toggle: same section again clears back to overview
    const next = section === id ? null : id;
    if (next) {
      router.replace(`/?section=${next}`, { scroll: false });
    } else {
      router.replace("/", { scroll: false });
    }
  };

  const iconBtn = (active: boolean) =>
    `inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition ${
      active ? "text-white" : "text-white/75 hover:text-white"
    }`;

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 transition-[background] duration-300 ${
        scrolled
          ? "bg-[var(--xp-header-bg)]/55 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div
        className={`pointer-events-auto flex w-full flex-wrap items-center gap-x-5 gap-y-2 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${APP_CONTENT}`}
      >
        <BrandMark size="md" className="order-1 !text-white drop-shadow-sm" />

        <div className="order-2 ml-auto flex shrink-0 items-center gap-0.5 md:order-3">
          {onReplaySplash ? (
            <button
              type="button"
              aria-label={t("bootPreviewHint")}
              title={t("bootPreviewHint")}
              onClick={onReplaySplash}
              className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium text-white/75 transition hover:text-white"
            >
              <Clapperboard className="h-4 w-4" />
              {t("bootPreview")}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t("navSearch")}
            aria-pressed={searchOpen}
            onClick={() => {
              if (searchOpen) {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                } else {
                  router.push("/");
                }
              } else {
                router.push("/search");
              }
            }}
            className={iconBtn(searchOpen)}
          >
            <Search className="h-5 w-5" />
          </button>
          <Link
            href="/account"
            aria-label={t("navAccount")}
            className={iconBtn(accountActive)}
          >
            <UserRound className="h-5 w-5" />
          </Link>
        </div>

        {showSections ? (
          <nav
            aria-label="Browse"
            className="order-3 flex w-full basis-full flex-wrap items-center gap-x-5 gap-y-1 md:order-2 md:w-auto md:flex-1 md:basis-auto"
          >
            {SECTIONS.map((id) => {
              const active = sectionActive(id, section, pathname);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={`cursor-pointer text-sm tracking-wide transition-colors duration-150 ${
                    active
                      ? "font-bold text-white underline decoration-2 underline-offset-[6px]"
                      : "font-medium text-white/70 hover:text-[var(--xp-accent)]"
                  }`}
                >
                  {sectionLabel(id)}
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

export function AppTopBar({ scrolled, onReplaySplash }: Props) {
  return (
    <Suspense fallback={null}>
      <AppTopBarInner scrolled={scrolled} onReplaySplash={onReplaySplash} />
    </Suspense>
  );
}
