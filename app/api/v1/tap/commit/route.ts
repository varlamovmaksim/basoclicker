import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { isDebugTimingEnabled, measureAsync } from "@/lib/telemetry/timing";
import { handleTapCommit } from "@/lib/tap/tap.controller";

/**
 * POST /api/v1/tap/commit — commit batched taps. Requires Authorization: Bearer <JWT>.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const debugTiming = isDebugTimingEnabled(request);
  const timings: Record<string, number> = {};

  let auth: { fid: string } | null;
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

  return handleTapCommit(
    request,
    auth,
    debugTiming ? timings : undefined
  );
}
