"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlugZap } from "lucide-react";
import { usePlaylists } from "@/components/providers/PlaylistProvider";
import { authenticate } from "@/lib/xtream/client";
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
  const [notice, setNotice] = useState<string | null>(null);

  if (process.env.NODE_ENV === "production") return null;

  const connect = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await fetch("/api/dev/xtream-defaults", { cache: "no-store" });
      const data = (await res.json()) as DevDefaults;
      if (!data.configured || !data.serverUrl || !data.username || !data.password) {
        throw new Error(
          data.hint ||
            "Missing XTREAM_DEV_* in .env.local. Restart npm run dev after saving.",
        );
      }

      const draft: PlaylistDraft = {
        name: data.name || data.username,
        serverUrl: data.serverUrl,
        username: data.username,
        password: data.password,
      };

      let authOk = true;
      try {
        await authenticate(draft);
      } catch (authErr) {
        authOk = false;
        setNotice(
          authErr instanceof Error
            ? `Connected locally, but panel check failed: ${authErr.message}`
            : "Connected locally, but panel check failed.",
        );
      }

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

      if (authOk) {
        router.replace("/");
        return;
      }
      // Keep the notice visible briefly, then go home anyway.
      window.setTimeout(() => router.replace("/"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
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
        {loading ? "Connecting…" : "Connect"}
      </button>
      <p className="text-center text-xs text-[var(--xp-muted)]">
        Uses <code className="text-[var(--xp-text)]">.env.local</code>{" "}
        (<code className="text-[var(--xp-text)]">XTREAM_DEV_*</code>). Restart
        the server after editing it.
      </p>
      {error ? (
        <p className="text-sm text-[var(--xp-danger)]">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-sm text-[var(--xp-accent)]">{notice}</p>
      ) : null}
    </div>
  );
}
