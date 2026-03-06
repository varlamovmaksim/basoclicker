import { NextRequest, NextResponse } from "next/server";
import { purchaseBooster } from "./boosters.service";

export interface BoostersAuthUser {
  fid: string;
}

function parseBody(body: unknown): string | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const id = o.booster_id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

/**
 * POST /api/v1/boosters/purchase — purchase one booster level with balance. Requires auth.
 * Body: { booster_id: string (UUID) }
 */
export async function handlePurchaseBooster(
  request: NextRequest,
  auth: BoostersAuthUser
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const boosterId = parseBody(body);
  if (!boosterId) {
    return NextResponse.json(
      { message: "Invalid or missing booster_id" },
      { status: 400 }
    );
  }

  const result = await purchaseBooster(auth, boosterId);

  if (!result.ok) {
    if (result.reason === "user_not_found") {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    if (result.reason === "booster_not_found") {
      return NextResponse.json(
        { message: "Booster not found" },
        { status: 404 }
      );
    }
    if (result.reason === "booster_locked") {
      return NextResponse.json(
        { ok: false, reason: "booster_locked" },
        { status: 200 }
      );
    }
    if (result.reason === "booster_max_level") {
      return NextResponse.json(
        { ok: false, reason: "booster_max_level" },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { ok: false, reason: "insufficient_balance" },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    balance: result.balance,
    boosters: result.boosters,
  });
}
