import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { handleTapCommit } from "@/lib/tap/tap.controller";

/**
 * POST /api/v1/tap/commit — commit batched taps. Requires Authorization: Bearer <JWT>.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ message: "Missing or invalid token" }, { status: 401 });
  }

  return handleTapCommit(request, auth);
}
