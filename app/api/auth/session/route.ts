import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { startSession } from "@/lib/tap/tap.service";

/**
 * POST /api/auth/session — create a new session for the authenticated user.
 * Returns session_id, balance, last_seq for initial client state.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ message: "Missing or invalid token" }, { status: 401 });
  }

  let deviceFingerprint: string | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (body != null && typeof body === "object" && typeof (body as Record<string, unknown>).device_fingerprint === "string") {
      deviceFingerprint = (body as { device_fingerprint: string }).device_fingerprint;
    }
  } catch {
    // optional body
  }

  const result = await startSession(auth, deviceFingerprint);
  return NextResponse.json(result);
}
