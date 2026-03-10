import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { handleSetDevBoosterCount } from "@/lib/boosters/boosters.controller";

const DEV_ALLOWED =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_DEV_ENERGY_RESTORE === "true";

/**
 * POST /api/dev/boosters — dev-only: set booster purchase count. Requires auth.
 * Body: { booster_id: string (UUID), count: number }
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  if (!DEV_ALLOWED) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json(
      { message: "Missing or invalid token" },
      { status: 401 }
    );
  }

  return handleSetDevBoosterCount(request, { address: auth.address });
}
