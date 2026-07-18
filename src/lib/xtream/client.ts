import type {
  LiveStream,
  SeriesInfo,
  SeriesItem,
  ShortEpgResponse,
  StreamKind,
  VodInfo,
  VodStream,
  XtreamAuthResponse,
  XtreamCategory,
  XtreamCredentials,
} from "./types";

export type ApiErrorBody = {
  error?: string;
};

async function xtreamFetch<T>(
  path: string,
  credentials: XtreamCredentials,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const res = await fetch(`${path}?${search.toString()}`, {
    method: "GET",
    headers: {
      "x-xtream-server": credentials.serverUrl,
      "x-xtream-username": credentials.username,
      "x-xtream-password": credentials.password,
    },
    cache: "no-store",
  });

  const data = (await res.json()) as T & ApiErrorBody;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function authenticate(
  credentials: XtreamCredentials,
): Promise<XtreamAuthResponse> {
  return xtreamFetch<XtreamAuthResponse>("/api/xtream/auth", credentials);
}

export async function getLiveCategories(
  credentials: XtreamCredentials,
): Promise<XtreamCategory[]> {
  return xtreamFetch<XtreamCategory[]>("/api/xtream/categories", credentials, {
    type: "live",
  });
}

export async function getVodCategories(
  credentials: XtreamCredentials,
): Promise<XtreamCategory[]> {
  return xtreamFetch<XtreamCategory[]>("/api/xtream/categories", credentials, {
    type: "vod",
  });
}

export async function getSeriesCategories(
  credentials: XtreamCredentials,
): Promise<XtreamCategory[]> {
  return xtreamFetch<XtreamCategory[]>("/api/xtream/categories", credentials, {
    type: "series",
  });
}

export async function getLiveStreams(
  credentials: XtreamCredentials,
  categoryId?: string,
): Promise<LiveStream[]> {
  return xtreamFetch<LiveStream[]>("/api/xtream/streams", credentials, {
    type: "live",
    category_id: categoryId,
  });
}

export async function getVodStreams(
  credentials: XtreamCredentials,
  categoryId?: string,
): Promise<VodStream[]> {
  return xtreamFetch<VodStream[]>("/api/xtream/streams", credentials, {
    type: "vod",
    category_id: categoryId,
  });
}

export async function getSeries(
  credentials: XtreamCredentials,
  categoryId?: string,
): Promise<SeriesItem[]> {
  return xtreamFetch<SeriesItem[]>("/api/xtream/streams", credentials, {
    type: "series",
    category_id: categoryId,
  });
}

export async function getVodInfo(
  credentials: XtreamCredentials,
  vodId: string | number,
): Promise<VodInfo> {
  return xtreamFetch<VodInfo>("/api/xtream/info", credentials, {
    type: "vod",
    id: vodId,
  });
}

export async function getSeriesInfo(
  credentials: XtreamCredentials,
  seriesId: string | number,
): Promise<SeriesInfo> {
  return xtreamFetch<SeriesInfo>("/api/xtream/info", credentials, {
    type: "series",
    id: seriesId,
  });
}

export async function getShortEpg(
  credentials: XtreamCredentials,
  streamId: string | number,
  limit = 4,
): Promise<ShortEpgResponse> {
  return xtreamFetch<ShortEpgResponse>("/api/xtream/epg", credentials, {
    stream_id: streamId,
    limit,
  });
}

export function watchPath(
  kind: StreamKind,
  id: string | number,
  extras?: Record<string, string>,
): string {
  const params = new URLSearchParams(extras);
  const qs = params.toString();
  return `/watch/${kind}/${id}${qs ? `?${qs}` : ""}`;
}
