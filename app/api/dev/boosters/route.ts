import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { getUserByFid, setBoosterLevels } from "@/lib/tap/tap.repository";

const DEV_ALLOWED =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_DEV_ENERGY_RESTORE === "true";

function parseBody(body: unknown): {
  points_booster_level?: number;
  energy_max_booster_level?: number;
  energy_regen_booster_level?: number;
  auto_taps_booster_level?: number;
} | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const result: {
    points_booster_level?: number;
    energy_max_booster_level?: number;
    energy_regen_booster_level?: number;
    auto_taps_booster_level?: number;
  } = {};
  if (typeof o.points_booster_level === "number" && o.points_booster_level >= 0) {
    result.points_booster_level = Math.floor(o.points_booster_level);
  }
  if (typeof o.energy_max_booster_level === "number" && o.energy_max_booster_level >= 0) {
    result.energy_max_booster_level = Math.floor(o.energy_max_booster_level);
  }
  if (typeof o.energy_regen_booster_level === "number" && o.energy_regen_booster_level >= 0) {
    result.energy_regen_booster_level = Math.floor(o.energy_regen_booster_level);
  }
  if (typeof o.auto_taps_booster_level === "number" && o.auto_taps_booster_level >= 0) {
    result.auto_taps_booster_level = Math.floor(o.auto_taps_booster_level);
  }
  if (Object.keys(result).length === 0) return null;
  return result;
}

/**
 * POST /api/dev/boosters — dev-only: set booster levels. Requires auth.
 * Body: { points_booster_level?, energy_max_booster_level?, energy_regen_booster_level?, auto_taps_booster_level? }
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

  const levels = parseBody(body);
  if (!levels) {
    return NextResponse.json(
      { message: "Provide at least one booster level (non-negative number)" },
      { status: 400 }
    );
  }

  const user = await getUserByFid(auth.fid);
  if (!user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  await setBoosterLevels(user.id, levels);

  return NextResponse.json({
    points_booster_level: levels.points_booster_level ?? user.pointsBoosterLevel,
    energy_max_booster_level: levels.energy_max_booster_level ?? user.energyMaxBoosterLevel,
    energy_regen_booster_level: levels.energy_regen_booster_level ?? user.energyRegenBoosterLevel,
    auto_taps_booster_level: levels.auto_taps_booster_level ?? user.autoTapsBoosterLevel,
  });
}
