import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { getBoosterListForUser } from "@/lib/boosters/boosters.service";
import { setUserBoosterCount } from "@/lib/boosters/boosters.repository";
import { getUserByFid } from "@/lib/tap/tap.repository";

const DEV_ALLOWED =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_DEV_ENERGY_RESTORE === "true";

function parseBody(body: unknown): { booster_id: string; count: number } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const booster_id = o.booster_id;
  const count = o.count;
  if (typeof booster_id !== "string" || booster_id.length === 0) return null;
  if (typeof count !== "number" || count < 0 || !Number.isFinite(count))
    return null;
  return { booster_id, count: Math.floor(count) };
}

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
    return NextResponse.json({ message: "Missing or invalid token" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json(
      { message: "Provide booster_id (string) and count (non-negative number)" },
      { status: 400 }
    );
  }

  const user = await getUserByFid(auth.fid);
  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  await setUserBoosterCount(user.id, parsed.booster_id, parsed.count);
  const boosters = await getBoosterListForUser(user.id);

  return NextResponse.json({
    booster_id: parsed.booster_id,
    count: parsed.count,
    boosters,
  });
}
