"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PlaylistForm } from "@/components/playlists/PlaylistForm";
import { usePlaylists } from "@/components/providers/PlaylistProvider";

export default function NewPlaylistPage() {
  const { addPlaylist } = usePlaylists();
  const router = useRouter();

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
        Add playlist
      </h1>
      <p className="mb-8 text-sm text-[var(--xp-muted)]">
        Credentials stay on this device. We only use them to talk to your Xtream
        panel.
      </p>
      <PlaylistForm
        submitLabel="Save & open"
        onSubmit={async (draft) => {
          addPlaylist(draft);
          router.replace("/");
        }}
      />
    </div>
  );
}
