import { NextRequest, NextResponse } from "next/server";
import { handleGetLeaderboard } from "@/lib/leaderboard/leaderboard.controller";

/**
 * GET /api/v1/leaderboard — top 100 by score (balance), total players, optional myRank when authenticated.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  return handleGetLeaderboard(request);
}
