"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/providers/LocaleProvider";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import {
  useTheme,
  type ThemePreference,
} from "@/components/providers/ThemeProvider";
import type { Locale } from "@/lib/i18n/dictionaries";
import { authenticate } from "@/lib/xtream/client";
import type { XtreamAuthResponse } from "@/lib/xtream/types";

export default function AccountPage() {
  const {
    activePlaylist,
    playlists,
    selectPlaylist,
    clearActive,
    removePlaylist,
    credentials,
  } = usePlaylists();
  const { locale, setLocale, t } = useLocale();
  const { preference, setPreference } = useTheme();
  const router = useRouter();
  const [info, setInfo] = useState<XtreamAuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    authenticate(credentials)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t("accountCheckFailed"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [credentials, t]);

  const user = info?.user_info;

  const languages: { id: Locale; label: string }[] = [
    { id: "es", label: t("langSpanish") },
    { id: "en", label: t("langEnglish") },
  ];

  const themes: { id: ThemePreference; label: string }[] = [
    { id: "system", label: t("themeSystem") },
    { id: "dark", label: t("themeDark") },
    { id: "light", label: t("themeLight") },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-5 md:px-6 md:py-8">
      <div>
        <h1 className="font-[family-name:var(--xp-font-display)] text-2xl font-bold">
          {t("accountTitle")}
        </h1>
        <p className="text-sm text-[var(--xp-muted)]">{t("accountSubtitle")}</p>
      </div>

      <section className="xp-fade-in space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--xp-muted)]">
          {t("theme")}
        </h2>
        <p className="text-sm text-[var(--xp-muted)]">{t("themeSubtitle")}</p>
        <div className="flex flex-wrap gap-2">
          {themes.map((theme) => {
            const active = preference === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => setPreference(theme.id)}
                className={`min-w-[7.5rem] cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                    : "border border-[var(--xp-border)] bg-[var(--xp-surface)] text-[var(--xp-muted)]"
                }`}
              >
                {theme.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="xp-fade-in space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--xp-muted)]">
          {t("language")}
        </h2>
        <p className="text-sm text-[var(--xp-muted)]">{t("languageSubtitle")}</p>
        <div className="flex gap-2">
          {languages.map((lang) => {
            const active = locale === lang.id;
            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => setLocale(lang.id)}
                className={`min-w-[7.5rem] cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
                    : "border border-[var(--xp-border)] bg-[var(--xp-surface)] text-[var(--xp-muted)]"
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="xp-fade-in space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--xp-muted)]">
          {t("activePlaylist")}
        </h2>
        <div className="rounded-2xl border border-[var(--xp-border)] bg-[var(--xp-surface)] p-4">
          <p className="text-lg font-semibold">{activePlaylist?.name}</p>
          <p className="text-sm text-[var(--xp-muted)]">
            {activePlaylist?.username}
          </p>
          <p className="truncate text-xs text-[var(--xp-muted)]">
            {activePlaylist?.serverUrl}
          </p>
          {user ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[var(--xp-muted)]">{t("status")}</dt>
                <dd>{user.status || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--xp-muted)]">{t("expires")}</dt>
                <dd>
                  {user.exp_date
                    ? new Date(Number(user.exp_date) * 1000).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--xp-muted)]">{t("connections")}</dt>
                <dd>
                  {user.active_cons || "0"} / {user.max_connections || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--xp-muted)]">{t("trial")}</dt>
                <dd>{user.is_trial === "1" ? t("yes") : t("no")}</dd>
              </div>
            </dl>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-[var(--xp-danger)]">{error}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--xp-muted)]">
            {t("playlists")}
          </h2>
          <Link href="/playlists/new" className="text-sm text-[var(--xp-accent)]">
            {t("add")}
          </Link>
        </div>
        <ul className="space-y-2">
          {playlists.map((playlist) => {
            const active = playlist.id === activePlaylist?.id;
            return (
              <li
                key={playlist.id}
                className="flex items-center gap-2 rounded-xl border border-[var(--xp-border)] px-3 py-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => {
                    selectPlaylist(playlist.id);
                    router.push("/");
                  }}
                >
                  <p className="truncate font-medium">
                    {playlist.name}
                    {active ? (
                      <span className="ml-2 text-xs text-[var(--xp-accent)]">
                        {t("active")}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[var(--xp-muted)]">
                    {playlist.username}
                  </p>
                </button>
                <Link
                  href={`/playlists/${playlist.id}/edit`}
                  className="text-xs text-[var(--xp-muted)] hover:text-[var(--xp-text)]"
                >
                  {t("edit")}
                </Link>
                <button
                  type="button"
                  className="cursor-pointer text-xs text-[var(--xp-danger)]"
                  onClick={() => {
                    if (
                      confirm(t("deleteConfirm", { name: playlist.name }))
                    ) {
                      removePlaylist(playlist.id);
                    }
                  }}
                >
                  {t("delete")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <button
        type="button"
        className="xp-btn xp-btn-ghost w-full"
        onClick={() => {
          clearActive();
          router.replace("/playlists");
        }}
      >
        {t("switchLock")}
      </button>
    </div>
  );
}
