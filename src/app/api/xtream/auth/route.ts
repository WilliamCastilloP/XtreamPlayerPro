import { NextRequest } from "next/server";
import {
  credentialsFromRequest,
  fetchXtreamJson,
  jsonError,
} from "@/lib/xtream/server";
import type { XtreamAuthResponse } from "@/lib/xtream/types";

export async function GET(request: NextRequest) {
  const credentials = credentialsFromRequest(request);
  if (!credentials) {
    return jsonError("Missing Xtream credentials");
  }

  try {
    const data = (await fetchXtreamJson(credentials)) as XtreamAuthResponse;
    const auth = data?.user_info?.auth;
    const ok = auth === 1 || auth === "1";
    if (!ok) {
      return jsonError("Invalid username or password", 401);
    }
    return Response.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    return jsonError(message, 502);
  }
}
