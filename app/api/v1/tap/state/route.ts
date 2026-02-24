import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { handleGetState } from "@/lib/tap/tap.controller";

/**
 * GET /api/v1/tap/state — return balance, last_seq, session_id for resync.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ message: "Missing or invalid token" }, { status: 401 });
  }

  return handleGetState(request, auth);
}
