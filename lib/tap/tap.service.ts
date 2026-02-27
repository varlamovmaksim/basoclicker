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
  purchaseBoosterLevel,
  setUserEnergy,
  updateUserAfterCommit,
  type UserRow,
} from "./tap.repository";
import type { BoosterTypeKey } from "./tap.repository";
import type {
  BoosterLevels,
  BoosterNextPrices,
  TapCommitRequest,
  TapCommitResponse,
  TapStateResponse,
} from "./types";
import { tapConfig } from "./config";
import {
  BOOSTER_BASE_PRICES,
  BOOSTER_EFFECTS,
  getBoosterNextPrice,
} from "./boosters.config";

export interface AuthUserForTap {
  fid: string;
}

export interface EffectiveBoosterStats {
  energyMax: number;
  energyRegenPerMin: number;
  pointsMultiplier: number;
  autoTapsPerMin: number;
  boosterLevels: BoosterLevels;
  boosterNextPrices: BoosterNextPrices;
}

export function getEffectiveBoosterStats(user: UserRow): EffectiveBoosterStats {
  const levels: BoosterLevels = {
    points: user.pointsBoosterLevel,
    energy_max: user.energyMaxBoosterLevel,
    energy_regen: user.energyRegenBoosterLevel,
    auto_taps: user.autoTapsBoosterLevel,
  };
  const energyMax =
    tapConfig.ENERGY_MAX + levels.energy_max * BOOSTER_EFFECTS.ENERGY_MAX_PER_LEVEL;
  const energyRegenPerMin =
    tapConfig.ENERGY_REGEN_PER_MIN +
    levels.energy_regen * BOOSTER_EFFECTS.ENERGY_REGEN_PER_LEVEL;
  const pointsMultiplier =
    1 + levels.points * BOOSTER_EFFECTS.POINTS_EFFECT_PER_LEVEL;
  const autoTapsPerMin = levels.auto_taps * BOOSTER_EFFECTS.AUTO_TAPS_PER_LEVEL;
  const boosterNextPrices: BoosterNextPrices = {
    points: getBoosterNextPrice(BOOSTER_BASE_PRICES.POINTS, levels.points),
    energy_max: getBoosterNextPrice(BOOSTER_BASE_PRICES.ENERGY_MAX, levels.energy_max),
    energy_regen: getBoosterNextPrice(BOOSTER_BASE_PRICES.ENERGY_REGEN, levels.energy_regen),
    auto_taps: getBoosterNextPrice(BOOSTER_BASE_PRICES.AUTO_TAPS, levels.auto_taps),
  };
  return {
    energyMax,
    energyRegenPerMin,
    pointsMultiplier,
    autoTapsPerMin,
    boosterLevels: levels,
    boosterNextPrices,
  };
}

/**
 * Compute current energy after regen since last_energy_at (or createdAt if never set).
 * Uses effective energyMax and energyRegenPerMin (from boosters).
 */
function currentEnergyAfterRegen(
  energy: number,
  lastEnergyAt: Date | null,
  createdAt: Date,
  serverNow: Date,
  energyMax: number,
  energyRegenPerMin: number
): number {
  const from = lastEnergyAt ?? createdAt;
  const elapsedMs = serverNow.getTime() - from.getTime();
  const elapsedMinutes = elapsedMs / 60_000;
  const regen = Math.floor(elapsedMinutes * energyRegenPerMin);
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

    const stats = getEffectiveBoosterStats(currentUser);
    const currentEnergy = currentEnergyAfterRegen(
      currentUser.energy,
      currentUser.lastEnergyAt,
      currentUser.createdAt,
      serverNow,
      stats.energyMax,
      stats.energyRegenPerMin
    );
    const effective = Math.min(requested, currentEnergy);
    const balanceDelta = Math.floor(effective * stats.pointsMultiplier);
    const newEnergy = currentEnergy - effective;
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
    await insertTapCommit(
      {
        userId: user.id,
        sessionId: body.session_id,
        seq: body.seq,
        requestedTaps: requested,
        appliedTaps: effective,
        maxAllowed: effective,
        ratio: null,
        abuseLevel: null,
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
      energy: newEnergy,
      energy_max: stats.energyMax,
      energy_regen_per_min: stats.energyRegenPerMin,
      points_multiplier: stats.pointsMultiplier,
      auto_taps_per_min: stats.autoTapsPerMin,
      booster_levels: stats.boosterLevels,
      booster_next_prices: stats.boosterNextPrices,
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
  energy_regen_per_min: number;
  points_multiplier?: number;
  auto_taps_per_min?: number;
  booster_levels?: BoosterLevels;
  booster_next_prices?: BoosterNextPrices;
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
  const serverNow = new Date();
  const stats = getEffectiveBoosterStats(user);
  const energy = currentEnergyAfterRegen(
    user.energy,
    user.lastEnergyAt,
    user.createdAt,
    serverNow,
    stats.energyMax,
    stats.energyRegenPerMin
  );
  return {
    session_id: session.id,
    balance: user.balance,
    last_seq: user.lastSeq,
    energy,
    energy_max: stats.energyMax,
    energy_regen_per_min: stats.energyRegenPerMin,
    points_multiplier: stats.pointsMultiplier,
    auto_taps_per_min: stats.autoTapsPerMin,
    booster_levels: stats.boosterLevels,
    booster_next_prices: stats.boosterNextPrices,
  };
}

/**
 * Return full state for the authenticated user (balance, energy, last_seq, session_id).
 */
export async function getFullState(
  auth: AuthUserForTap
): Promise<TapStateResponse | null> {
  const user = await getUserByFid(auth.fid);
  if (!user) return null;

  const session = await getLatestSessionByUserId(user.id);
  const serverNow = new Date();
  const stats = getEffectiveBoosterStats(user);
  const energy = currentEnergyAfterRegen(
    user.energy,
    user.lastEnergyAt,
    user.createdAt,
    serverNow,
    stats.energyMax,
    stats.energyRegenPerMin
  );

  return {
    balance: user.balance,
    last_seq: user.lastSeq,
    session_id: session?.id ?? "",
    energy,
    energy_max: stats.energyMax,
    energy_regen_per_min: stats.energyRegenPerMin,
    points_multiplier: stats.pointsMultiplier,
    auto_taps_per_min: stats.autoTapsPerMin,
    booster_levels: stats.boosterLevels,
    booster_next_prices: stats.boosterNextPrices,
    server_time: serverNow.getTime(),
  };
}

/**
 * Dev-only: set user energy to max. Call only when ALLOW_DEV_ENERGY_RESTORE or NODE_ENV is development.
 */
export async function restoreEnergy(auth: AuthUserForTap): Promise<{ energy: number } | null> {
  const user = await getUserByFid(auth.fid);
  if (!user) return null;
  const stats = getEffectiveBoosterStats(user);
  await setUserEnergy(user.id, stats.energyMax, new Date());
  return { energy: stats.energyMax };
}

export type PurchaseBoosterResult =
  | { ok: true; balance: number; booster_levels: BoosterLevels }
  | { ok: false; reason: "user_not_found" | "insufficient_balance" };

/**
 * Purchase one level of a booster by deducting balance. Returns new balance and levels on success.
 */
export async function purchaseBooster(
  auth: AuthUserForTap,
  boosterType: BoosterTypeKey
): Promise<PurchaseBoosterResult> {
  const user = await getUserByFid(auth.fid);
  if (!user) return { ok: false, reason: "user_not_found" };

  const levels = {
    points: user.pointsBoosterLevel,
    energy_max: user.energyMaxBoosterLevel,
    energy_regen: user.energyRegenBoosterLevel,
    auto_taps: user.autoTapsBoosterLevel,
  };
  const basePrices = {
    points: BOOSTER_BASE_PRICES.POINTS,
    energy_max: BOOSTER_BASE_PRICES.ENERGY_MAX,
    energy_regen: BOOSTER_BASE_PRICES.ENERGY_REGEN,
    auto_taps: BOOSTER_BASE_PRICES.AUTO_TAPS,
  };
  const price = getBoosterNextPrice(basePrices[boosterType], levels[boosterType]);

  if (user.balance < price) return { ok: false, reason: "insufficient_balance" };

  const updated = await purchaseBoosterLevel(user.id, boosterType, price);
  if (!updated) return { ok: false, reason: "insufficient_balance" };

  const newLevels: BoosterLevels = {
    points: updated.pointsBoosterLevel,
    energy_max: updated.energyMaxBoosterLevel,
    energy_regen: updated.energyRegenBoosterLevel,
    auto_taps: updated.autoTapsBoosterLevel,
  };
  return { ok: true, balance: updated.balance, booster_levels: newLevels };
}
