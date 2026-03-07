import {
  getBoosterListForUser,
  getEffectiveBoosterStats,
} from "@/lib/boosters/boosters.service";
import {
  commitUserAndIncrementSession,
  startSessionWithIdleMiningInDb,
} from "@/lib/session/session.repository";
import {
  getOrCreateUserByFid,
  getUserByIdForUpdate,
  getUserByFid,
  setUserEnergy,
  updateUserAfterIdleMining,
} from "@/lib/user/user.repository";
import { tapConfig } from "@/lib/tap/config";
import { getStateContext, getCommitContext, runInTransaction } from "./tap.repository";
import type {
  BoosterListItem,
  TapCommitRequest,
  TapCommitResponse,
  TapStateResponse,
} from "./types";

export interface AuthUserForTap {
  fid: string;
}

/** User slice for idle mining: pick from UserRow. */
interface UserForIdleMining {
  lastCommitAt: Date | null;
  lastEnergyAt: Date | null;
  createdAt: Date;
}

/** User slice for energy regen: pick from UserRow. */
interface UserForEnergyRegen {
  energy: number;
  lastEnergyAt: Date | null;
  createdAt: Date;
}

/**
 * Compute idle mining points for elapsed time since last_commit_at (fallback: last_energy_at, then createdAt).
 * Mining does not consume energy.
 */
function computeIdleMining(
  user: UserForIdleMining,
  serverNow: Date,
  miningPointsPerSec: number
): number {
  if (miningPointsPerSec <= 0) return 0;
  const from = user.lastCommitAt ?? user.lastEnergyAt ?? user.createdAt;
  const elapsedMs = serverNow.getTime() - from.getTime();
  const elapsedSec = elapsedMs / 1000;
  return Math.floor(elapsedSec * miningPointsPerSec);
}

/**
 * Compute current energy after regen since last_energy_at (or createdAt if never set).
 * Uses effective energyMax and energyRegenPerSec (from boosters).
 */
function currentEnergyAfterRegen(
  user: UserForEnergyRegen,
  serverNow: Date,
  energyMax: number,
  energyRegenPerSec: number
): number {
  const from = user.lastEnergyAt ?? user.createdAt;
  const elapsedMs = serverNow.getTime() - from.getTime();
  const elapsedSeconds = elapsedMs / 1000;
  const regen = Math.floor(elapsedSeconds * energyRegenPerSec);
  const added = Math.min(energyMax - user.energy, regen);
  return Math.min(energyMax, user.energy + added);
}

/**
 * Commit taps: validate session, apply energy cap (1 tap = 1 energy), persist in transaction.
 */
export async function commitTaps(
  body: TapCommitRequest,
  auth: AuthUserForTap
): Promise<TapCommitResponse> {
  const ctx = await getCommitContext(auth.fid, body.session_id);
  if (!ctx) {
    return {
      ok: false,
      resync_required: true,
      session_id: body.session_id,
      last_seq: 0,
    };
  }
  const { user, stats, list: boosters } = ctx;

  const requested = Math.max(0, Math.floor(body.taps_delta));
  const serverNow = new Date();

  return await runInTransaction(async (tx) => {
    const expectedSeq = user.lastSeq + 1;
    if (body.seq !== expectedSeq) {
      return {
        ok: false,
        resync_required: true,
        session_id: body.session_id,
        last_seq: user.lastSeq,
      };
    }

    const currentEnergy = currentEnergyAfterRegen(
      user,
      serverNow,
      stats.energyMax,
      stats.energyRegenPerSec
    );

    const idleMiningPoints = computeIdleMining(
      user,
      serverNow,
      stats.miningPointsPerSec
    );
    const effectiveManual = Math.min(requested, currentEnergy);
    const manualPointsRaw = effectiveManual * stats.pointsMultiplier;
    const serverFloorPoints = Math.floor(manualPointsRaw);
    const pointsFromClient =
      typeof body.points_delta === "number" && body.points_delta >= 0
        ? Math.min(
            body.points_delta,
            serverFloorPoints + 1
          )
        : null;
    const balanceDelta =
      (pointsFromClient !== null ? pointsFromClient : serverFloorPoints) +
      idleMiningPoints;
    const newEnergy = currentEnergy - effectiveManual;
    const newBalance = user.balance + balanceDelta;

    const persisted = await commitUserAndIncrementSession(
      user.id,
      body.session_id,
      expectedSeq,
      balanceDelta,
      newEnergy,
      serverNow,
      serverNow,
      body.seq,
      tx
    );
    if (!persisted) {
      return {
        ok: false,
        resync_required: true,
        session_id: body.session_id,
        last_seq: user.lastSeq,
      };
    }

    return {
      ok: true,
      server_seq: body.seq,
      applied_taps: effectiveManual,
      mining_points_applied: idleMiningPoints,
      balance: newBalance,
      energy: newEnergy,
      energy_max: stats.energyMax,
      energy_regen_per_sec: stats.energyRegenPerSec,
      points_multiplier: stats.pointsMultiplier,
      mining_points_per_sec: stats.miningPointsPerSec,
      boosters,
      server_time: serverNow.getTime(),
      resync_required: false,
      session_id: body.session_id,
      last_seq: body.seq,
    };
  });
}

export interface StartSessionResult {
  session_id: string;
  balance: number;
  last_seq: number;
  energy: number;
  energy_max: number;
  energy_regen_per_sec: number;
  server_time: number;
  points_multiplier?: number;
  mining_points_per_sec?: number;
  boosters?: BoosterListItem[];
}

/**
 * Create or get user, create a new session, return session_id and initial state.
 * Idle mining and stats are computed in the DB in one round-trip; booster list is fetched separately.
 */
export async function startSession(
  auth: AuthUserForTap,
  deviceFingerprint?: string | null
): Promise<StartSessionResult> {
  const user = await getOrCreateUserByFid(auth.fid);

  return await runInTransaction(async (tx) => {
    const result = await startSessionWithIdleMiningInDb(
      user.id,
      deviceFingerprint ?? null,
      tapConfig.ENERGY_REGEN_PER_SEC,
      tapConfig.ENERGY_MAX,
      tx
    );
    if (!result) throw new Error("User not found after lock");
    const boosters = await getBoosterListForUser(user.id, tx as unknown);

    return {
      session_id: result.session.id,
      balance: result.balance,
      last_seq: result.lastSeq,
      energy: result.energyAfterRegen,
      energy_max: result.energyMax,
      energy_regen_per_sec: result.energyRegenPerSec,
      server_time: result.serverTime,
      points_multiplier: result.pointsMultiplier,
      mining_points_per_sec: result.miningPointsPerSec,
      boosters,
    };
  });
}

/**
 * Return full state for the authenticated user (balance, energy, last_seq, session_id).
 * Applies idle mining in a transaction when applicable (persists balance + last_commit_at).
 */
export async function getFullState(
  auth: AuthUserForTap
): Promise<TapStateResponse | null> {
  const ctx = await getStateContext(auth.fid);
  if (!ctx) return null;
  const { user, session, stats, list: boosters } = ctx;

  return await runInTransaction(async (tx) => {
    const currentUser = await getUserByIdForUpdate(user.id, tx);
    if (!currentUser) return null;

    const serverNow = new Date();
    const miningPoints = computeIdleMining(
      currentUser,
      serverNow,
      stats.miningPointsPerSec
    );
    if (miningPoints > 0) {
      await updateUserAfterIdleMining(
        currentUser.id,
        miningPoints,
        serverNow,
        tx
      );
    }
    const balance =
      miningPoints > 0 ? currentUser.balance + miningPoints : currentUser.balance;
    const energy = currentEnergyAfterRegen(
      currentUser,
      serverNow,
      stats.energyMax,
      stats.energyRegenPerSec
    );

    return {
      balance,
      last_seq: currentUser.lastSeq,
      session_id: session?.id ?? "",
      energy,
      energy_max: stats.energyMax,
      energy_regen_per_sec: stats.energyRegenPerSec,
      points_multiplier: stats.pointsMultiplier,
      mining_points_per_sec: stats.miningPointsPerSec,
      boosters,
      server_time: serverNow.getTime(),
    };
  });
}

/**
 * Dev-only: set user energy to max. Call only when ALLOW_DEV_ENERGY_RESTORE or NODE_ENV is development.
 */
export async function restoreEnergy(auth: AuthUserForTap): Promise<{ energy: number } | null> {
  const user = await getUserByFid(auth.fid);
  if (!user) return null;
  const stats = await getEffectiveBoosterStats(user.id);
  await setUserEnergy(user.id, stats.energyMax, new Date());
  return { energy: stats.energyMax };
}

