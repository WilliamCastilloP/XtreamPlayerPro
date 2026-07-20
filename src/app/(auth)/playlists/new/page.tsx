"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PlaylistForm } from "@/components/playlists/PlaylistForm";
import { DevEnvConnectButton } from "@/components/playlists/DevEnvConnectButton";
import { usePlaylists } from "@/components/providers/PlaylistProvider";

const isDev = process.env.NODE_ENV === "development";

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
        {isDev ? "Conectar" : "Add playlist"}
      </h1>
      <p className="mb-8 text-sm text-[var(--xp-muted)]">
        {isDev
          ? "Un clic lee XTREAM_DEV_* de tu .env.local y entra a la app."
          : "Credentials stay on this device. We only use them to talk to your Xtream panel."}
      </p>

      {isDev ? (
        <div className="mb-10">
          <DevEnvConnectButton />
        </div>
      ) : null}

      {!isDev ? (
        <PlaylistForm
          submitLabel="Save & open"
          onSubmit={async (draft) => {
            addPlaylist(draft);
            router.replace("/");
          }}
        />
      ) : (
        <details className="group">
          <summary className="cursor-pointer text-sm text-[var(--xp-muted)] hover:text-[var(--xp-text)]">
            Manual form
          </summary>
          <div className="mt-6">
            <PlaylistForm
              submitLabel="Save & open"
              onSubmit={async (draft) => {
                addPlaylist(draft);
                router.replace("/");
              }}
            />
          </div>
        </details>
      )}
    </div>
  );
}
