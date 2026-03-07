import { getBoosterNextPrice } from "./boosters.config";
import type {
  BoosterListItem,
  BoosterRow,
  EffectiveBoosterStats,
} from "./types";

export type BoosterStatsConfig = {
  energyMax: number;
  energyRegenPerSec: number;
};

/** Total effect contribution from a booster with level effect coefficient (geometric series). */
export function effectiveContribution(
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
export function buildBoosterList(
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
export function computeStatsFromBoostersAndCounts(
  boosters: BoosterRow[],
  counts: Map<string, number>,
  config: BoosterStatsConfig
): EffectiveBoosterStats {
  let energyRegenPerSec = config.energyRegenPerSec;
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
    energyMax: config.energyMax,
    energyRegenPerSec,
    pointsMultiplier,
    miningPointsPerSec,
  };
}

/** Pure: given boosters, counts, and config, return stats and list. */
export function computeStatsAndBoosterList(
  boosters: BoosterRow[],
  counts: Map<string, number>,
  config: BoosterStatsConfig
): { stats: EffectiveBoosterStats; list: BoosterListItem[] } {
  const stats = computeStatsFromBoostersAndCounts(boosters, counts, config);
  const list = buildBoosterList(boosters, counts);
  return { stats, list };
}
