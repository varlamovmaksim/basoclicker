import { NextRequest, NextResponse } from "next/server";
import type { DailyClaimAuthUser } from "./daily-claim.service";
import {
  getDailyClaimStatus,
  verifyAndApplyDailyClaim,
} from "./daily-claim.service";

const DEFAULT_CHAIN_ID = 8453;

function parseChainIdFromRequest(request: NextRequest): number {
  const url = new URL(request.url);
  const chainId = url.searchParams.get("chain_id");
  if (chainId === null) return DEFAULT_CHAIN_ID;
  const n = parseInt(chainId, 10);
  return Number.isNaN(n) ? DEFAULT_CHAIN_ID : n;
}

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

/**
 * GET /api/v1/daily-claim/status?chain_id=8453 — return whether user can claim daily and last claim time.
 */
export async function handleGetDailyClaimStatus(
  request: NextRequest,
  auth: DailyClaimAuthUser
): Promise<NextResponse> {
  const chainId = parseChainIdFromRequest(request);
  const status = await getDailyClaimStatus(auth, chainId);

  if (!status) {
    return NextResponse.json(
      { message: "User not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(status);
}

