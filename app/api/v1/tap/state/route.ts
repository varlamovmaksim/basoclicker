import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { isDebugTimingEnabled, measureAsync } from "@/lib/telemetry/timing";
import { handleGetState } from "@/lib/tap/tap.controller";

/**
 * GET /api/v1/tap/state — return balance, last_seq, session_id for resync.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  const debugTiming = isDebugTimingEnabled(request);
  const timings: Record<string, number> = {};

  let auth: { address: string } | null;
  if (debugTiming) {
    const { result, ms } = await measureAsync("auth", () =>
      getAuthFromRequest(request)
    );
    auth = result;
    timings.auth_ms = ms;
  } else {
    auth = await getAuthFromRequest(request);
  }

  if (!auth) {
    return NextResponse.json(
      { message: "Missing or invalid token" },
      { status: 401 }
    );
  }

  return handleGetState(
    request,
    auth,
    debugTiming ? timings : undefined
  );
}
