import { db } from "@/lib/db/client";
import {
  createSession,
  getLatestSessionByUserId,
  getOrCreateUserByFid,
  getSessionByIdAndUserId,
  getUserByFid,
  getUserById,
  incrementSessionCommitCount,
  insertTapCommit,
  updateUserAfterCommit,
} from "./tap.repository";
import type { TapCommitRequest, TapCommitResponse, TapStateResponse } from "./types";
import { getAbuseLevel, handleAbuse } from "./abuse";
import { tapConfig } from "./config";

export interface AuthUserForTap {
  fid: string;
}

/**
 * Commit taps: validate session, apply server-time cap, persist in transaction.
 */
export async function commitTaps(
  body: TapCommitRequest,
  auth: AuthUserForTap
): Promise<TapCommitResponse> {
  const user = await getUserByFid(auth.fid);
  if (!user) {
    return {
      ok: false,
      resync_required: true,
    };
  }

  const session = await getSessionByIdAndUserId(body.session_id, user.id);
  if (!session) {
    return {
      ok: false,
      resync_required: true,
    };
  }

  const requested = Math.max(0, Math.floor(body.taps_delta));
  const serverNow = new Date();
  const { BASE_MAX_TPS, MIN_DELTA_T_SEC, FIRST_COMMIT_CAP } = tapConfig;

  return await db.transaction(async (tx) => {
    const currentUser = await getUserById(user.id, tx);
    if (!currentUser) {
      return { ok: false, resync_required: true };
    }

    const expectedSeq = currentUser.lastSeq + 1;
    if (body.seq !== expectedSeq) {
      return {
        ok: false,
        resync_required: true,
      };
    }

    let maxAllowed: number;
    let deltaTSeconds = 0;

    if (currentUser.lastCommitAt == null) {
      maxAllowed = FIRST_COMMIT_CAP;
    } else {
      deltaTSeconds =
        (serverNow.getTime() - currentUser.lastCommitAt.getTime()) / 1000;
      if (deltaTSeconds < MIN_DELTA_T_SEC) {
        return { ok: false, resync_required: false };
      }
      maxAllowed = Math.floor(BASE_MAX_TPS * deltaTSeconds);
    }

    const effective = Math.min(requested, maxAllowed);
    const ratio = maxAllowed > 0 ? requested / maxAllowed : 0;
    const abuseLevel = getAbuseLevel(ratio);

    handleAbuse({
      userId: user.id,
      sessionId: body.session_id,
      fid: auth.fid,
      requested,
      applied: effective,
      maxAllowed,
      ratio,
      seq: body.seq,
      deltaTSeconds,
    });

    const newBalance = currentUser.balance + effective;

    await updateUserAfterCommit(
      user.id,
      effective,
      serverNow,
      body.seq,
      tx
    );
    await insertTapCommit(
      {
        userId: user.id,
        sessionId: body.session_id,
        seq: body.seq,
        requestedTaps: requested,
        appliedTaps: effective,
        maxAllowed,
        ratio: ratio.toFixed(4),
        abuseLevel: abuseLevel !== "none" ? abuseLevel : null,
        serverTime: serverNow,
        clientDurationMs: body.duration_ms ?? null,
      },
      tx
    );
    await incrementSessionCommitCount(body.session_id, tx);

    return {
      ok: true,
      server_seq: body.seq,
      applied_taps: effective,
      balance: newBalance,
      server_time: serverNow.getTime(),
      resync_required: false,
    };
  });
}

export interface StartSessionResult {
  session_id: string;
  balance: number;
  last_seq: number;
}

/**
 * Create or get user, create a new session, return session_id and initial state.
 */
export async function startSession(
  auth: AuthUserForTap,
  deviceFingerprint?: string | null
): Promise<StartSessionResult> {
  const user = await getOrCreateUserByFid(auth.fid);
  const session = await createSession(user.id, deviceFingerprint);
  return {
    session_id: session.id,
    balance: user.balance,
    last_seq: user.lastSeq,
  };
}

/**
 * Return full state for the authenticated user (balance, last_seq, session_id).
 */
export async function getFullState(
  auth: AuthUserForTap
): Promise<TapStateResponse | null> {
  const user = await getUserByFid(auth.fid);
  if (!user) return null;

  const session = await getLatestSessionByUserId(user.id);

  return {
    balance: user.balance,
    last_seq: user.lastSeq,
    session_id: session?.id ?? "",
    server_time: Date.now(),
  };
}
