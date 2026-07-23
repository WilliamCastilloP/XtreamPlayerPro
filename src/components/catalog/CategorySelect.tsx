"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BrowseKind } from "@/components/catalog/BrowseRails";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  collectGenres,
  loadAllSeries,
  loadAllVodStreams,
  loadLiveCategories,
} from "@/lib/xtream/catalog-cache";

type Props = {
  kind: BrowseKind;
  className?: string;
};

export function CategorySelect({ kind, className = "" }: Props) {
  const { credentials } = usePlaylists();
  const { t } = useLocale();
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const byGenre = kind === "movies" || kind === "series";
  const allLabel = byGenre ? t("genreAll") : t("categoryAll");
  const selectedLabel =
    options.find((o) => o.id === value)?.name || allLabel;

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    setValue("");
    setOpen(false);
    void (async () => {
      try {
        if (kind === "live") {
          const cats = await loadLiveCategories(credentials);
          if (cancelled) return;
          setOptions(
            cats.map((c) => ({
              id: String(c.category_id),
              name: c.category_name,
            })),
          );
          return;
        }

        const items =
          kind === "movies"
            ? await loadAllVodStreams(credentials)
            : await loadAllSeries(credentials);
        if (cancelled) return;
        setOptions(
          collectGenres(items).map((genre) => ({
            id: genre,
            name: genre,
          })),
        );
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [credentials, kind]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    setValue(id);
    setOpen(false);
    if (!id) return;
    const name = options.find((o) => o.id === id)?.name || id;
    router.push(
      `/browse/${kind}/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`,
    );
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <span className="sr-only">
        {byGenre ? t("genreFilter") : t("categoryFilter")}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full max-w-full cursor-pointer items-center gap-2 rounded-full border border-[var(--xp-border)] bg-[var(--xp-surface)] py-2 pl-4 pr-4 text-left text-xs font-semibold text-[var(--xp-text)]"
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        )}
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-[var(--xp-border)] bg-[var(--xp-surface)] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <li role="option" aria-selected={!value}>
            <button
              type="button"
              className={`flex w-full cursor-pointer px-4 py-2.5 text-left text-xs font-semibold ${
                !value
                  ? "bg-[var(--xp-accent-dim)] text-[var(--xp-accent)]"
                  : "text-[var(--xp-text)] hover:bg-[var(--xp-surface-2)]"
              }`}
              onClick={() => pick("")}
            >
              {allLabel}
            </button>
          </li>
          {options.map((o) => (
            <li key={o.id} role="option" aria-selected={value === o.id}>
              <button
                type="button"
                className={`flex w-full cursor-pointer px-4 py-2.5 text-left text-xs font-semibold ${
                  value === o.id
                    ? "bg-[var(--xp-accent-dim)] text-[var(--xp-accent)]"
                    : "text-[var(--xp-text)] hover:bg-[var(--xp-surface-2)]"
                }`}
                onClick={() => pick(o.id)}
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
