import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { handlePurchaseBooster } from "@/lib/boosters/boosters.controller";

/**
 * POST /api/v1/boosters/purchase — purchase one booster level with balance. Requires auth.
 * Body: { booster_id: string (UUID) }
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

  return handlePurchaseBooster(request, auth);
}
