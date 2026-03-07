import { NextRequest, NextResponse } from "next/server";
import type { DailyClaimAuthUser } from "./daily-claim.service";
import { verifyAndApplyDailyClaim } from "./daily-claim.service";

interface DailyClaimRequestBody {
  tx_hash: string;
  chain_id?: number;
}

function parseBody(body: unknown): DailyClaimRequestBody | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const tx_hash = o.tx_hash;
  const chain_id = o.chain_id;
  if (typeof tx_hash !== "string") return null;
  return {
    tx_hash,
    chain_id: typeof chain_id === "number" ? chain_id : undefined,
  };
}

export async function handleDailyClaim(
  request: NextRequest,
  auth: DailyClaimAuthUser
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 }
    );
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, reason: "invalid_body" },
      { status: 400 }
    );
  }

  const chainId =
    typeof parsed.chain_id === "number" ? parsed.chain_id : 8453; // Base mainnet
  const result = await verifyAndApplyDailyClaim(
    auth,
    parsed.tx_hash,
    chainId
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    balance: result.balance,
  });
}

