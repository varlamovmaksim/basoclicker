import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import {
  handleDailyClaim,
  handleGetDailyClaimStatus,
} from "@/lib/daily-claim/daily-claim.controller";

/**
 * GET /api/v1/daily-claim — return daily claim status. Requires auth.
 * Query: chain_id (optional, default 8453)
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json(
      { message: "Missing or invalid token" },
      { status: 401 }
    );
  }

  return handleGetDailyClaimStatus(request, auth);
}

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

