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
  let username: string | null | undefined;
  let displayName: string | null | undefined;
  let walletAddress: string | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (body != null && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (typeof b.device_fingerprint === "string")
        deviceFingerprint = b.device_fingerprint;
      if (b.username !== undefined)
        username = typeof b.username === "string" ? b.username : null;
      if (b.display_name !== undefined)
        displayName =
          typeof b.display_name === "string" ? b.display_name : null;
      if (b.wallet_address !== undefined && typeof b.wallet_address === "string") {
        const addr = b.wallet_address;
        if (/^0x[a-fA-F0-9]{40}$/.test(addr)) walletAddress = addr;
      }
    }
  } catch {
    // optional body
  }

  const result = await startSession(
    { fid: auth.fid, username, displayName },
    deviceFingerprint,
    walletAddress
  );
  return NextResponse.json(result);
}
