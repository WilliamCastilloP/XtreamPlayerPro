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

  const streamId = request.nextUrl.searchParams.get("stream_id");
  const limit = request.nextUrl.searchParams.get("limit") || "4";
  if (!streamId) {
    return jsonError("Missing stream_id");
  }

  try {
    const data = await fetchXtreamJson(credentials, {
      action: "get_short_epg",
      stream_id: streamId,
      limit,
    });
    return Response.json(data ?? { epg_listings: [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load EPG";
    return jsonError(message, 502);
  }
}
