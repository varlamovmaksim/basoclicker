import { db } from "@/lib/db/client";
import {
  createSession,
  getBoosters,
  getLatestSessionByUserId,
  getOrCreateUserByFid,
  getSessionByIdAndUserId,
  getUserBoosterCounts,
  getUserByFid,
  getUserById,
  incrementSessionCommitCount,
  purchaseBooster as repoPurchaseBooster,
  setUserEnergy,
  updateUserAfterCommit,
  updateUserAfterIdleMining,
  type BoosterRow,
} from "./tap.repository";
import type {
  BoosterListItem,
  TapCommitRequest,
  TapCommitResponse,
  TapStateResponse,
} from "./types";
import { tapConfig } from "./config";
import { getBoosterNextPrice } from "./boosters.config";

/** Total effect contribution from a booster with level effect coefficient (geometric series). */
function effectiveContribution(
  effectAmount: number,
  coefficient: number,
  count: number
): number {
  if (count <= 0) return 0;
  if (coefficient === 1) return count * effectAmount;
  return (
    effectAmount * (Math.pow(coefficient, count) - 1) / (coefficient - 1)
  );
}

export interface AuthUserForTap {
  fid: string;
}

export interface EffectiveBoosterStats {
  energyMax: number;
  energyRegenPerSec: number;
  pointsMultiplier: number;
  /** Fixed score added per second (from auto_points boosters). Effect amount is interpreted as points/sec. */
  miningPointsPerSec: number;
}

/** Compute effective stats from boosters and user purchase counts. */
export async function getEffectiveBoosterStats(
  userId: string,
  client?: unknown
): Promise<EffectiveBoosterStats> {
  const [boosters, counts] = await Promise.all([
    getBoosters(client),
    getUserBoosterCounts(userId, client),
  ]);
  let energyRegenPerSec = tapConfig.ENERGY_REGEN_PER_SEC;
  let pointsMultiplier = 1;
  let miningPointsPerSec = 0;
  for (const b of boosters) {
    const count = counts.get(b.id) ?? 0;
    const effectAmount = Number(b.effectAmount);
    const coeff = Number(b.levelEffectCoefficient);
    const contribution = effectiveContribution(effectAmount, coeff, count);
    if (b.type === "energy_regen") energyRegenPerSec += contribution;
    else if (b.type === "points_per_tap") pointsMultiplier += contribution;
    else if (b.type === "auto_points") miningPointsPerSec += contribution;
  }
  return {
    energyMax: tapConfig.ENERGY_MAX,
    energyRegenPerSec,
    pointsMultiplier,
    miningPointsPerSec,
  };
}

/** Build booster list for API (with count, next_price, unlocked). */
export async function getBoosterListForUser(
  userId: string,
  client?: unknown
): Promise<BoosterListItem[]> {
  const [boosters, counts] = await Promise.all([
    getBoosters(client),
    getUserBoosterCounts(userId, client),
  ]);
  const byType: Record<string, BoosterRow[]> = {};
  for (const b of boosters) {
    if (!byType[b.type]) byType[b.type] = [];
    byType[b.type].push(b);
  }
  const list: BoosterListItem[] = [];
  const coeff = (s: string) => Number(s);
  for (const b of boosters) {
    const count = counts.get(b.id) ?? 0;
    const nextPrice = getBoosterNextPrice(
      b.basePrice,
      coeff(b.priceIncreaseCoefficient),
      count
    );
    const prevInType = byType[b.type];
    const orderIdx = Number(b.orderIndex);
    const prevIndex = prevInType?.findIndex((x) => x.id === b.id) ?? -1;
    const prevBooster = prevIndex > 0 ? prevInType?.[prevIndex - 1] : null;
    const currentPreviousCount = prevBooster
      ? counts.get(prevBooster.id) ?? 0
      : 0;
    // First in type (order_index 0 or first in list) is always unlocked
    const isFirstInType = orderIdx === 0 || prevIndex === 0;
    const unlocked =
      isFirstInType ||
      (prevBooster != null &&
        currentPreviousCount >= Number(b.unlockAfterPrevious));
    list.push({
      id: b.id,
      type: b.type,
      order_index: orderIdx,
      name: b.name,
      emoji: b.emoji,
      effect_amount: Number(b.effectAmount),
      count,
      next_price: nextPrice,
      unlocked,
      unlock_after_previous: Number(b.unlockAfterPrevious),
      current_previous_count: prevBooster != null ? currentPreviousCount : undefined,
      max_level: Number(b.maxLevel),
      level_effect_coefficient: Number(b.levelEffectCoefficient),
    });
  }
  return list;
}

/**
 * Compute idle mining points for elapsed time since last_commit_at (fallback: last_energy_at, then createdAt).
 * Mining does not consume energy.
 */
function computeIdleMining(
  lastCommitAt: Date | null,
  lastEnergyAt: Date | null,
  createdAt: Date,
  serverNow: Date,
  miningPointsPerSec: number
): number {
  if (miningPointsPerSec <= 0) return 0;
  const from = lastCommitAt ?? lastEnergyAt ?? createdAt;
  const elapsedMs = serverNow.getTime() - from.getTime();
  const elapsedSec = elapsedMs / 1000;
  return Math.floor(elapsedSec * miningPointsPerSec);
}

/**
 * Compute current energy after regen since last_energy_at (or createdAt if never set).
 * Uses effective energyMax and energyRegenPerSec (from boosters).
 */
function currentEnergyAfterRegen(
  energy: number,
  lastEnergyAt: Date | null,
  createdAt: Date,
  serverNow: Date,
  energyMax: number,
  energyRegenPerSec: number
): number {
  const from = lastEnergyAt ?? createdAt;
  const elapsedMs = serverNow.getTime() - from.getTime();
  const elapsedSeconds = elapsedMs / 1000;
  const regen = Math.floor(elapsedSeconds * energyRegenPerSec);
  const added = Math.min(energyMax - energy, regen);
  return Math.min(energyMax, energy + added);
}

/**
 * Commit taps: validate session, apply energy cap (1 tap = 1 energy), persist in transaction.
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
      session_id: body.session_id,
      last_seq: user.lastSeq,
    };
  }

  const requested = Math.max(0, Math.floor(body.taps_delta));
  const serverNow = new Date();

  return await db.transaction(async (tx) => {
    const currentUser = await getUserById(user.id, tx);
    if (!currentUser) {
      return {
        ok: false,
        resync_required: true,
        session_id: body.session_id,
        last_seq: user.lastSeq,
      };
    }

    const expectedSeq = currentUser.lastSeq + 1;
    if (body.seq !== expectedSeq) {
      return {
        ok: false,
        resync_required: true,
        session_id: body.session_id,
        last_seq: currentUser.lastSeq,
      };
    }

    const stats = await getEffectiveBoosterStats(currentUser.id, tx as unknown);
    const currentEnergy = currentEnergyAfterRegen(
      currentUser.energy,
      currentUser.lastEnergyAt,
      currentUser.createdAt,
      serverNow,
      stats.energyMax,
      stats.energyRegenPerSec
    );

    const idleMiningPoints = computeIdleMining(
      currentUser.lastCommitAt,
      currentUser.lastEnergyAt,
      currentUser.createdAt,
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
    const newBalance = currentUser.balance + balanceDelta;

    await updateUserAfterCommit(
      user.id,
      balanceDelta,
      newEnergy,
      serverNow,
      serverNow,
      body.seq,
      tx
    );
    await incrementSessionCommitCount(body.session_id, tx);

    const boosters = await getBoosterListForUser(user.id, tx as unknown);
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
 * Applies idle mining in the same transaction when applicable.
 */
export async function startSession(
  auth: AuthUserForTap,
  deviceFingerprint?: string | null
): Promise<StartSessionResult> {
  const user = await getOrCreateUserByFid(auth.fid);

  return await db.transaction(async (tx) => {
    const session = await createSession(user.id, deviceFingerprint, tx);
    const currentUser = await getUserById(user.id, tx);
    if (!currentUser) throw new Error("User not found after createSession");

    const serverNow = new Date();
    const [stats, boosters] = await Promise.all([
      getEffectiveBoosterStats(currentUser.id, tx as unknown),
      getBoosterListForUser(currentUser.id, tx as unknown),
    ]);
    const miningPoints = computeIdleMining(
      currentUser.lastCommitAt,
      currentUser.lastEnergyAt,
      currentUser.createdAt,
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
      currentUser.energy,
      currentUser.lastEnergyAt,
      currentUser.createdAt,
      serverNow,
      stats.energyMax,
      stats.energyRegenPerSec
    );

    return {
      session_id: session.id,
      balance,
      last_seq: currentUser.lastSeq,
      energy,
      energy_max: stats.energyMax,
      energy_regen_per_sec: stats.energyRegenPerSec,
      server_time: serverNow.getTime(),
      points_multiplier: stats.pointsMultiplier,
      mining_points_per_sec: stats.miningPointsPerSec,
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
  const user = await getUserByFid(auth.fid);
  if (!user) return null;

  return await db.transaction(async (tx) => {
    const currentUser = await getUserById(user.id, tx);
    if (!currentUser) return null;

    const session = await getLatestSessionByUserId(user.id);
    const serverNow = new Date();
    const [stats, boosters] = await Promise.all([
      getEffectiveBoosterStats(currentUser.id, tx as unknown),
      getBoosterListForUser(currentUser.id, tx as unknown),
    ]);
    const miningPoints = computeIdleMining(
      currentUser.lastCommitAt,
      currentUser.lastEnergyAt,
      currentUser.createdAt,
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
      currentUser.energy,
      currentUser.lastEnergyAt,
      currentUser.createdAt,
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

export type PurchaseBoosterResult =
  | { ok: true; balance: number; boosters: BoosterListItem[] }
  | {
      ok: false;
      reason:
        | "user_not_found"
        | "insufficient_balance"
        | "booster_not_found"
        | "booster_locked"
        | "booster_max_level";
    };

/**
 * Purchase one level of a booster by deducting balance. Returns new balance and booster list on success.
 */
export async function purchaseBooster(
  auth: AuthUserForTap,
  boosterId: string
): Promise<PurchaseBoosterResult> {
  const user = await getUserByFid(auth.fid);
  if (!user) return { ok: false, reason: "user_not_found" };

  const boosters = await getBoosters();
  const counts = await getUserBoosterCounts(user.id);
  const booster = boosters.find((b) => b.id === boosterId);
  if (!booster) return { ok: false, reason: "booster_not_found" };

  const byType = boosters.filter((b) => b.type === booster.type);
  const prevIndex = byType.findIndex((b) => b.id === booster.id) - 1;
  const prevBooster = prevIndex >= 0 ? byType[prevIndex] : null;
  const currentPreviousCount = prevBooster ? counts.get(prevBooster.id) ?? 0 : 0;
  const orderIdx = Number(booster.orderIndex);
  const unlocked =
    orderIdx === 0 ||
    (prevBooster != null &&
      currentPreviousCount >= Number(booster.unlockAfterPrevious));
  if (!unlocked) return { ok: false, reason: "booster_locked" };

  const count = counts.get(booster.id) ?? 0;
  if (count >= booster.maxLevel) return { ok: false, reason: "booster_max_level" };

  const coeff = Number(booster.priceIncreaseCoefficient);
  const price = getBoosterNextPrice(booster.basePrice, coeff, count);
  if (user.balance < price) return { ok: false, reason: "insufficient_balance" };

  const result = await repoPurchaseBooster(user.id, boosterId, price);
  if (!result) return { ok: false, reason: "insufficient_balance" };

  const newBoosters = await getBoosterListForUser(user.id);
  return { ok: true, balance: result.user.balance, boosters: newBoosters };
}
