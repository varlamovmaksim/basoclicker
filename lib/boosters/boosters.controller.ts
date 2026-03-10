import { NextRequest, NextResponse } from "next/server";
import { getBoosterListForUser } from "./boosters.service";
import { setUserBoosterCount } from "./boosters.repository";
import { getUserByAddress } from "@/lib/user/user.repository";
import { purchaseBooster } from "./boosters.service";

export interface BoostersAuthUser {
  address: string;
}

function parseDevBoosterBody(
  body: unknown
): { booster_id: string; count: number } | null {
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
export async function handleSetDevBoosterCount(
  request: NextRequest,
  auth: BoostersAuthUser
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseDevBoosterBody(body);
  if (!parsed) {
    return NextResponse.json(
      {
        message:
          "Provide booster_id (string) and count (non-negative number)",
      },
      { status: 400 }
    );
  }

  const user = await getUserByAddress(auth.address);
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
