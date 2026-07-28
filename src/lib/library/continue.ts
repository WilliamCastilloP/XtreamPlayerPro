import type { ContinueItem } from "@/lib/library/storage";
import { withBack } from "@/lib/navigation/back";
import { watchPath } from "@/lib/xtream/client";

export function continueWatchHref(item: ContinueItem): string {
  if (item.kind === "live") return `/live/${item.streamId}`;
  if (item.kind === "movie") {
    return watchPath("movie", item.streamId, {
      title: item.title,
      image: item.image || "",
      ext: item.extension || "mp4",
      ...(item.duration ? { duration: String(item.duration) } : {}),
    });
  }
  return watchPath("series", item.streamId, {
    title: item.title,
    image: item.image || "",
    ext: item.extension || "mp4",
    seriesId: String(item.seriesId ?? ""),
    season: String(item.season ?? ""),
    episode: String(item.episode ?? ""),
    ...(item.duration ? { duration: String(item.duration) } : {}),
  });
}

/** Detail page for a continue item (series → show, movie → movie, live → channel). */
export function continueDetailHref(item: ContinueItem, back?: string): string {
  const href =
    item.kind === "live"
      ? `/live/${item.streamId}`
      : item.kind === "movie"
        ? `/movies/${item.streamId}`
        : `/series/${item.seriesId ?? item.streamId}`;
  return back ? withBack(href, back) : href;
}

export function continueFromZeroHref(item: ContinueItem): string {
  const base = continueWatchHref(item);
  return `${base}${base.includes("?") ? "&" : "?"}t=0`;
}
