"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlugZap } from "lucide-react";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import type { PlaylistDraft } from "@/lib/playlists/types";

type DevDefaults = {
  configured?: boolean;
  hint?: string;
  name?: string;
  serverUrl?: string;
  username?: string;
  password?: string;
};

/**
 * One-click connect using XTREAM_DEV_* from `.env.local` (dev only).
 * Does not call the Xtream panel — just loads credentials and opens the app.
 */
export function DevEnvConnectButton({
  className = "xp-btn xp-btn-primary w-full",
}: {
  className?: string;
}) {
  const { playlists, addPlaylist, editPlaylist, selectPlaylist } =
    usePlaylists();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (process.env.NODE_ENV === "production") return null;

  const connect = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/dev/xtream-defaults", { cache: "no-store" });
      const data = (await res.json()) as DevDefaults;
      if (!data.configured || !data.serverUrl || !data.username || !data.password) {
        throw new Error(
          data.hint ||
            "Faltan XTREAM_DEV_* en .env.local. Guarda el archivo y reinicia npm run dev.",
        );
      }

      const draft: PlaylistDraft = {
        name: data.name || data.username,
        serverUrl: data.serverUrl,
        username: data.username,
        password: data.password,
      };

      const existing = playlists.find(
        (p) =>
          p.serverUrl === draft.serverUrl && p.username === draft.username,
      );
      if (existing) {
        editPlaylist(existing.id, draft);
        selectPlaylist(existing.id);
      } else {
        addPlaylist(draft);
      }

      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void connect()}
        disabled={loading}
        className={className}
      >
        <PlugZap className="h-4 w-4" />
        {loading ? "Conectando…" : "Conectar"}
      </button>
      <p className="text-center text-xs text-[var(--xp-muted)]">
        Lee <code className="text-[var(--xp-text)]">.env.local</code> (
        <code className="text-[var(--xp-text)]">XTREAM_DEV_*</code>). Reinicia
        el servidor si acabas de editarlo.
      </p>
      {error ? (
        <p className="text-sm text-[var(--xp-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
