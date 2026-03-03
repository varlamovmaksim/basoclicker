import { NextRequest, NextResponse } from "next/server";
import { commitTaps, getFullState } from "./tap.service";
import type { TapCommitRequest } from "./types";

export interface TapAuthUser {
  fid: string;
}

function parseTapCommitBody(body: unknown): TapCommitRequest | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const session_id = o.session_id;
  const seq = o.seq;
  const taps_delta = o.taps_delta;
  const duration_ms = o.duration_ms;
  if (
    typeof session_id !== "string" ||
    typeof seq !== "number" ||
    typeof taps_delta !== "number"
  ) {
    return null;
  }
  return {
    session_id,
    seq,
    taps_delta,
    duration_ms: typeof duration_ms === "number" ? duration_ms : 0,
    client_balance_view:
      typeof o.client_balance_view === "number" ? o.client_balance_view : undefined,
    client_ts_start:
      typeof o.client_ts_start === "number" ? o.client_ts_start : undefined,
    client_ts_end:
      typeof o.client_ts_end === "number" ? o.client_ts_end : undefined,
    device_info:
      o.device_info != null && typeof o.device_info === "object"
        ? (o.device_info as TapCommitRequest["device_info"])
        : undefined,
  };
}

/**
 * POST /api/v1/tap/commit — commit batched taps. Requires auth (fid).
 */
export async function handleTapCommit(
  request: NextRequest,
  auth: TapAuthUser
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

  const parsed = parseTapCommitBody(body);
  if (!parsed) {
    return NextResponse.json(
      { message: "Missing or invalid session_id, seq, or taps_delta" },
      { status: 400 }
    );
  }

  const result = await commitTaps(parsed, auth);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        resync_required: result.resync_required ?? true,
        balance: result.balance,
        server_time: result.server_time,
        session_id: result.session_id,
        last_seq: result.last_seq,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    server_seq: result.server_seq,
    applied_taps: result.applied_taps,
    mining_points_applied: result.mining_points_applied,
    balance: result.balance,
    energy: result.energy,
    energy_max: result.energy_max,
    energy_regen_per_sec: result.energy_regen_per_sec,
    points_multiplier: result.points_multiplier,
    mining_points_per_sec: result.mining_points_per_sec,
    boosters: result.boosters,
    server_time: result.server_time,
    resync_required: false,
    session_id: result.session_id ?? parsed.session_id,
    last_seq: result.last_seq ?? result.server_seq,
  });
}

/**
 * GET /api/v1/tap/state — return balance, last_seq, session_id for resync.
 */
export async function handleGetState(
  _request: NextRequest,
  auth: TapAuthUser
): Promise<NextResponse> {
  const state = await getFullState(auth);
  if (!state) {
    return NextResponse.json(
      { message: "User not found" },
      { status: 404 }
    );
  }
  return NextResponse.json(state);
}
