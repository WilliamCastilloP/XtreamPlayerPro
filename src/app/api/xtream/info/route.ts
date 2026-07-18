import { NextRequest } from "next/server";
import {
  credentialsFromRequest,
  fetchXtreamJson,
  jsonError,
} from "@/lib/xtream/server";

export async function GET(request: NextRequest) {
  const credentials = credentialsFromRequest(request);
  if (!credentials) {
    return jsonError("Missing Xtream credentials");
  }

  const type = request.nextUrl.searchParams.get("type");
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return jsonError("Missing id");
  }

  const action =
    type === "series"
      ? "get_series_info"
      : type === "vod"
        ? "get_vod_info"
        : null;

  if (!action) {
    return jsonError("Invalid info type");
  }

  const params =
    type === "series"
      ? { action, series_id: id }
      : { action, vod_id: id };

  try {
    const data = await fetchXtreamJson(credentials, params);
    return Response.json(data ?? {});
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load info";
    return jsonError(message, 502);
  }
}
