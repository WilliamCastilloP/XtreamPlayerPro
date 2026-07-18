"use client";

import { BrowseRails } from "@/components/catalog/BrowseRails";

export default function LivePage() {
  return (
    <BrowseRails
      kind="live"
      title="Live TV"
      subtitle="Swipe rows, tap a channel to play. Rotate for fullscreen."
      maxRails={10}
    />
  );
}
