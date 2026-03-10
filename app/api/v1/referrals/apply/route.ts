import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { applyReferralCodeController } from "@/lib/referrals/referrals.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json(
      { message: "Missing or invalid token" },
      { status: 401 }
    );
  }

  return applyReferralCodeController(request, auth);
}

