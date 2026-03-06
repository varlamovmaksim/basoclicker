import { getUserByFid } from "@/lib/tap/tap.repository";
import { tapConfig } from "@/lib/tap/config";
import {
  getBoosters,
  getUserBoosterCounts,
  purchaseBooster as repoPurchaseBooster,
} from "./boosters.repository";
import { getBoosterNextPrice } from "./boosters.config";
import type {
  BoosterListItem,
  BoosterRow,
  EffectiveBoosterStats,
  PurchaseBoosterResult,
} from "./types";

/** Total effect contribution from a booster with level effect coefficient (geometric series). */
function effectiveContribution(
  effectAmount: number,
  coefficient: number,
  count: number
): number {
  if (count <= 0) return 0;
  if (coefficient === 1) return count * effectAmount;
  return (
    (effectAmount * (Math.pow(coefficient, count) - 1)) / (coefficient - 1)
  );
}

/** Build booster list from boosters + counts (pure). */
function buildBoosterList(
  boosters: BoosterRow[],
  counts: Map<string, number>
): BoosterListItem[] {
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
      current_previous_count:
        prevBooster != null ? currentPreviousCount : undefined,
      max_level: Number(b.maxLevel),
      level_effect_coefficient: Number(b.levelEffectCoefficient),
    });
  }
  return list;
}

/** Compute effective stats from boosters and counts (pure). */
function computeStatsFromBoostersAndCounts(
  boosters: BoosterRow[],
  counts: Map<string, number>
): EffectiveBoosterStats {
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

/** One DB round-trip for boosters + counts; returns stats and list. Accepts optional client (tx) for use inside tap transactions. */
export async function getStatsAndBoosterList(
  userId: string,
  client?: unknown
): Promise<{ stats: EffectiveBoosterStats; list: BoosterListItem[] }> {
  const [boosters, counts] = await Promise.all([
    getBoosters(client),
    getUserBoosterCounts(userId, client),
  ]);
  const stats = computeStatsFromBoostersAndCounts(boosters, counts);
  const list = buildBoosterList(boosters, counts);
  return { stats, list };
}

export async function getEffectiveBoosterStats(
  userId: string,
  client?: unknown
): Promise<EffectiveBoosterStats> {
  const { stats } = await getStatsAndBoosterList(userId, client);
  return stats;
}

export async function getBoosterListForUser(
  userId: string,
  client?: unknown
): Promise<BoosterListItem[]> {
  const { list } = await getStatsAndBoosterList(userId, client);
  return list;
}

export interface AuthUserForBoosters {
  fid: string;
}

/**
 * Purchase one level of a booster by deducting balance. Returns new balance and booster list on success.
 */
export async function purchaseBooster(
  auth: AuthUserForBoosters,
  boosterId: string
): Promise<PurchaseBoosterResult> {
  const user = await getUserByFid(auth.fid);
  if (!user) return { ok: false, reason: "user_not_found" };

  const [boosters, counts] = await Promise.all([
    getBoosters(),
    getUserBoosterCounts(user.id),
  ]);
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
  if (count >= booster.maxLevel)
    return { ok: false, reason: "booster_max_level" };

  const coeff = Number(booster.priceIncreaseCoefficient);
  const price = getBoosterNextPrice(booster.basePrice, coeff, count);
  if (user.balance < price) return { ok: false, reason: "insufficient_balance" };

  const result = await repoPurchaseBooster(user.id, boosterId, price);
  if (!result) return { ok: false, reason: "insufficient_balance" };

  const newBoosters = buildBoosterList(boosters, result.counts);
  return { ok: true, balance: result.balance, boosters: newBoosters };
}
