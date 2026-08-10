import type { VodInfo, VodStream } from "./types";

/** True when get_vod_info returned an empty shell (common on some panels). */
export function vodInfoIsSparse(info: VodInfo | null | undefined): boolean {
  if (!info) return true;
  const name =
    info.info?.name?.trim() ||
    info.movie_data?.name?.trim() ||
    info.movie_data?.title?.trim() ||
    "";
  const image =
    info.info?.movie_image?.trim() || info.info?.cover_big?.trim() || "";
  return !name && !image;
}

/** Normalize panel field aliases so the UI can read one shape. */
export function normalizeVodInfo(info: VodInfo): VodInfo {
  const raw = info.info;
  if (!raw && !info.movie_data) return info;

  return {
    ...info,
    info: raw
      ? {
          ...raw,
          name: raw.name,
          plot: raw.plot || raw.description,
          cast: raw.cast || raw.actors,
          releasedate: raw.releasedate || raw.release_date,
          movie_image: raw.movie_image || raw.cover_big,
        }
      : raw,
    movie_data: info.movie_data
      ? {
          ...info.movie_data,
          name: info.movie_data.name || info.movie_data.title,
        }
      : info.movie_data,
  };
}

/**
 * When get_vod_info is empty, fill name/poster/meta from the VOD catalog
 * (same source as home/browse rails).
 */
export function mergeVodInfoWithStream(
  info: VodInfo | null | undefined,
  stream: VodStream | null | undefined,
): VodInfo {
  const base = normalizeVodInfo(info ?? {});
  if (!stream || !vodInfoIsSparse(info)) return base;

  return normalizeVodInfo({
    info: {
      ...base.info,
      name: base.info?.name || stream.name,
      plot: base.info?.plot || stream.plot,
      genre: base.info?.genre || stream.genre,
      rating: base.info?.rating ?? stream.rating,
      movie_image: base.info?.movie_image || stream.stream_icon,
    },
    movie_data: {
      ...base.movie_data,
      stream_id: base.movie_data?.stream_id ?? stream.stream_id,
      name: base.movie_data?.name || stream.name,
      title: base.movie_data?.title || stream.title,
      container_extension:
        base.movie_data?.container_extension || stream.container_extension,
    },
  });
}
