"use client";

import { FormEvent, useState } from "react";
import type { PlaylistDraft } from "@/lib/playlists/types";
import { authenticate } from "@/lib/xtream/client";

type Props = {
  initial?: Partial<PlaylistDraft>;
  submitLabel: string;
  onSubmit: (draft: PlaylistDraft) => void | Promise<void>;
};

export function PlaylistForm({ initial, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [serverUrl, setServerUrl] = useState(initial?.serverUrl ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const draft: PlaylistDraft = {
      name: name.trim(),
      serverUrl: serverUrl.trim(),
      username: username.trim(),
      password,
    };

    try {
      if (!draft.name || !draft.serverUrl || !draft.username || !draft.password) {
        throw new Error("Please fill in all fields.");
      }
      try {
        await authenticate(draft);
      } catch (authErr) {
        // In local dev, still save so you can keep working if the panel is
        // temporarily unreachable from this PC.
        if (process.env.NODE_ENV === "development") {
          setError(
            authErr instanceof Error
              ? `Saved locally, but panel check failed: ${authErr.message}`
              : "Saved locally, but panel check failed.",
          );
          await onSubmit(draft);
          return;
        }
        throw authErr;
      }
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save playlist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="xp-fade-in space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm text-[var(--xp-muted)]">Playlist name</span>
        <input
          className="xp-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Home, Work, Provider X…"
          autoComplete="off"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-[var(--xp-muted)]">Server URL</span>
        <input
          className="xp-field"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="http://example.com:8080"
          autoComplete="url"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-[var(--xp-muted)]">Username</span>
        <input
          className="xp-field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-[var(--xp-muted)]">Password</span>
        <input
          className="xp-field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error ? (
        <p className="text-sm text-[var(--xp-danger)]">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="xp-btn xp-btn-primary w-full"
      >
        {loading ? "Validating…" : submitLabel}
      </button>
    </form>
  );
}
