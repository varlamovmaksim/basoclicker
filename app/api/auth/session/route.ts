import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { issueAppToken } from "@/lib/auth/app-jwt";
import { startSession } from "@/lib/tap/tap.service";
import { applyReferralCodeOnAuth } from "@/lib/referrals/referrals.service";
import { normalizeWalletAddress } from "@/lib/user/identity";

/**
 * POST /api/auth/session — create a session and return our JWT.
 * Auth: either (1) Authorization: Bearer <our JWT or dev>, or (2) body.wallet_address.
 * Returns session_id, balance, last_seq, and token (our JWT for subsequent requests).
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  let address: string | null = null;
  const authorization = request.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const auth = await getAuthFromRequest(request);
    if (auth) address = auth.address;
  }

  let deviceFingerprint: string | undefined;
  let username: string | null | undefined;
  let displayName: string | null | undefined;
  let walletAddressFromBody: string | undefined;
  let referralCodeFromQuery: string | undefined;
  let fidFromBody: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    if (body != null && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (typeof b.fid === "number") fidFromBody = String(b.fid);
      else if (typeof b.fid === "string" && /^\d+$/.test(b.fid)) fidFromBody = b.fid;
      if (typeof b.device_fingerprint === "string")
        deviceFingerprint = b.device_fingerprint;
      if (b.username !== undefined)
        username = typeof b.username === "string" ? b.username : null;
      if (b.display_name !== undefined)
        displayName =
          typeof b.display_name === "string" ? b.display_name : null;
      if (b.wallet_address !== undefined && typeof b.wallet_address === "string") {
        const normalized = normalizeWalletAddress(b.wallet_address);
        if (normalized) walletAddressFromBody = normalized;
      }
      if (b.referral_code !== undefined && typeof b.referral_code === "string") {
        referralCodeFromQuery = b.referral_code;
      }
    }
  } catch {
    // optional body
  }

  if (address && walletAddressFromBody && address !== walletAddressFromBody) {
    return NextResponse.json({ message: "Wallet address mismatch" }, { status: 401 });
  }

  if (!address && walletAddressFromBody) {
    address = walletAddressFromBody;
  }

  if (!address) {
    return NextResponse.json({ message: "Missing auth: send Bearer token or body.wallet_address" }, { status: 401 });
  }

  if (referralCodeFromQuery) {
    void applyReferralCodeOnAuth(
      { address, fid: fidFromBody, username, displayName },
      referralCodeFromQuery
    );
  }

  const result = await startSession(
    { address, fid: fidFromBody, username, displayName },
    deviceFingerprint
  );

  let token: string;
  try {
    token = issueAppToken(address);
  } catch {
    return NextResponse.json({ message: "Server auth misconfiguration" }, { status: 500 });
  }

  return NextResponse.json({ ...result, token });
}
