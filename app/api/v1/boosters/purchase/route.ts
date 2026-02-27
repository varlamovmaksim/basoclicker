import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/auth.controller";
import { purchaseBooster } from "@/lib/tap/tap.service";
import type { BoosterTypeKey } from "@/lib/tap/tap.repository";

const BOOSTER_TYPES: BoosterTypeKey[] = [
  "points",
  "energy_max",
  "energy_regen",
  "auto_taps",
];

function parseBody(body: unknown): BoosterTypeKey | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const t = o.booster_type;
  if (typeof t !== "string" || !BOOSTER_TYPES.includes(t as BoosterTypeKey))
    return null;
  return t as BoosterTypeKey;
}

/**
 * POST /api/v1/boosters/purchase — purchase one booster level with balance. Requires auth.
 * Body: { booster_type: "points" | "energy_max" | "energy_regen" | "auto_taps" }
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse> {
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

  const boosterType = parseBody(body);
  if (!boosterType) {
    return NextResponse.json(
      { message: "Invalid or missing booster_type" },
      { status: 400 }
    );
  }

  const result = await purchaseBooster(auth, boosterType);

  if (!result.ok) {
    if (result.reason === "user_not_found") {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, reason: "insufficient_balance" },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    balance: result.balance,
    booster_levels: result.booster_levels,
  });
}
