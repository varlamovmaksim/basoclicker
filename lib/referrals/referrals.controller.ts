import { NextRequest, NextResponse } from "next/server";
import {
  applyReferralCodeForAddress,
  getReferralProfileForAddress,
} from "./referrals.service";

export interface ReferralAuthUser {
  address: string;
}

export async function getReferralProfileController(
  _request: NextRequest,
  auth: ReferralAuthUser
): Promise<NextResponse> {
  try {
    const profile = await getReferralProfileForAddress(auth.address);
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

  let code = "";
  if (body && typeof body === "object") {
    const maybeCode = (body as Record<string, unknown>).code;
    if (typeof maybeCode === "string") {
      code = maybeCode;
    }
  }

  const result = await applyReferralCodeForAddress(auth.address, code);

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

