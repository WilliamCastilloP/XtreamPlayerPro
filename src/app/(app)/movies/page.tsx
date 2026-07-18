"use client";

import { BrowseRails } from "@/components/catalog/BrowseRails";

export default function MoviesPage() {
  return (
    <BrowseRails
      kind="movies"
      title="Movies"
      subtitle="Browse by category — tap a poster for details or play from the hero."
      maxRails={10}
    />
  );
}
