"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PlaylistForm } from "@/components/playlists/PlaylistForm";
import { usePlaylists } from "@/components/providers/PlaylistProvider";

export default function EditPlaylistPage() {
  const params = useParams<{ id: string }>();
  const { playlists, editPlaylist } = usePlaylists();
  const router = useRouter();
  const playlist = playlists.find((p) => p.id === params.id);

  if (!playlist) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <p className="mb-4">Playlist not found.</p>
        <Link href="/playlists" className="text-[var(--xp-accent)]">
          Back to playlists
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-8">
      <Link
        href="/playlists"
        className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--xp-muted)] hover:text-[var(--xp-text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <h1 className="mb-2 font-[family-name:var(--xp-font-display)] text-3xl font-bold">
        Edit playlist
      </h1>
      <p className="mb-8 text-sm text-[var(--xp-muted)]">{playlist.name}</p>
      <PlaylistForm
        initial={playlist}
        submitLabel="Save changes"
        onSubmit={async (draft) => {
          editPlaylist(playlist.id, draft);
          router.replace("/playlists");
        }}
      />
    </div>
  );
}
