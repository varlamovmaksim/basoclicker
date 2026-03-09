import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { getLeaderboard } from "./leaderboard.service";

/**
 * GET /api/v1/leaderboard — top 100 by balance, total players count, optional myRank when authenticated.
 */
export async function handleGetLeaderboard(
  request: NextRequest
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(request);
  const fid = auth?.fid ?? null;

  const result = await getLeaderboard(fid);
  return NextResponse.json(result);
}
