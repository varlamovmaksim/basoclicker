import { NextRequest, NextResponse } from "next/server";
import {
  applyReferralCodeForFid,
  getReferralProfileForFid,
} from "./referrals.service";

export interface ReferralAuthUser {
  fid: string;
}

export async function getReferralProfileController(
  _request: NextRequest,
  auth: ReferralAuthUser
): Promise<NextResponse> {
  try {
    const profile = await getReferralProfileForFid(auth.fid);
    return NextResponse.json({
      referralCode: profile.referralCode,
      appliedReferralCode: profile.appliedReferralCode,
      referralsCount: profile.referralsCount,
    });
  } catch {
    return NextResponse.json(
      { message: "User not found" },
      { status: 404 }
    );
  }
}

export async function applyReferralCodeController(
  request: NextRequest,
  auth: ReferralAuthUser
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "code_invalid" },
      { status: 400 }
    );
  }

  const code =
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).code === "string"
      ? (body as Record<string, unknown>).code
      : "";

  const result = await applyReferralCodeForFid(auth.fid, code);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    reason: "ok",
    referralCode: result.profile?.referralCode,
    appliedReferralCode: result.profile?.appliedReferralCode,
    referralsCount: result.profile?.referralsCount,
  });
}

