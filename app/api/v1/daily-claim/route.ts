import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { handleDailyClaim } from "@/lib/daily-claim/daily-claim.controller";

/**
 * POST /api/v1/daily-claim — verify onchain daily claim tx and grant points. Requires auth.
 * Body: { tx_hash: string, chain_id?: number }
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json(
      { message: "Missing or invalid token" },
      { status: 401 }
    );
  }

  return handleDailyClaim(request, auth);
}

