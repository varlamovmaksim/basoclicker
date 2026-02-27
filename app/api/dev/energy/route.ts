import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { restoreEnergy } from "@/lib/tap/tap.service";

const DEV_ALLOWED =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_DEV_ENERGY_RESTORE === "true";

/**
 * POST /api/dev/energy — dev-only: restore energy to max. Requires auth.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  if (!DEV_ALLOWED) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ message: "Missing or invalid token" }, { status: 401 });
  }

  const result = await restoreEnergy(auth);
  if (!result) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
