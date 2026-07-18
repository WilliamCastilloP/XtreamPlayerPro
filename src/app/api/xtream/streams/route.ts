import { NextRequest } from "next/server";
import {
  credentialsFromRequest,
  fetchXtreamJson,
  jsonError,
} from "@/lib/xtream/server";

const ACTION_MAP = {
  live: "get_live_streams",
  vod: "get_vod_streams",
  series: "get_series",
} as const;

export async function GET(request: NextRequest) {
  const credentials = credentialsFromRequest(request);
  if (!credentials) {
    return jsonError("Missing Xtream credentials");
  }

  const type = request.nextUrl.searchParams.get("type") || "live";
  const categoryId = request.nextUrl.searchParams.get("category_id") || undefined;
  const action = ACTION_MAP[type as keyof typeof ACTION_MAP];
  if (!action) {
    return jsonError("Invalid stream type");
  }

  try {
    const data = await fetchXtreamJson(credentials, {
      action,
      category_id: categoryId,
    });
    return Response.json(Array.isArray(data) ? data : []);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load streams";
    return jsonError(message, 502);
  }
}
