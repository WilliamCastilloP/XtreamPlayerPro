"use client";

import { BrowseRails } from "@/components/catalog/BrowseRails";

export default function SeriesPage() {
  return (
    <BrowseRails
      kind="series"
      title="Series"
      subtitle="Row-by-row browsing — open a show to pick season and episode."
      maxRails={10}
    />
  );
}
