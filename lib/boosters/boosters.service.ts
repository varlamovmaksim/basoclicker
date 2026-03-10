import { getUserByAddress } from "@/lib/user/user.repository";
import { tapConfig } from "@/lib/tap/config";
import {
  getBoosters,
  getUserBoosterCounts,
  purchaseBooster as repoPurchaseBooster,
} from "./boosters.repository";
import {
  buildBoosterList,
  computeStatsAndBoosterList,
} from "./boosters.calculations";
import { getBoosterNextPrice } from "./boosters.config";
import type {
  BoosterListItem,
  EffectiveBoosterStats,
  PurchaseBoosterResult,
} from "./types";

function boosterStatsConfig() {
  return {
    energyMax: tapConfig.ENERGY_MAX,
    energyRegenPerSec: tapConfig.ENERGY_REGEN_PER_SEC,
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
  return computeStatsAndBoosterList(
    boosters,
    counts,
    boosterStatsConfig()
  );
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
  address: string;
}

/**
 * Purchase one level of a booster by deducting balance. Returns new balance and booster list on success.
 */
export async function purchaseBooster(
  auth: AuthUserForBoosters,
  boosterId: string
): Promise<PurchaseBoosterResult> {
  const user = await getUserByAddress(auth.address);
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
