/** One booster in the list returned to client (with user's count and unlock state). */
export interface BoosterListItem {
  id: string;
  type: string;
  order_index: number;
  name: string;
  emoji: string;
  effect_amount: number;
  count: number;
  next_price: number;
  unlocked: boolean;
  unlock_after_previous: number;
  current_previous_count?: number;
  max_level: number;
  level_effect_coefficient?: number;
}

export interface EffectiveBoosterStats {
  energyMax: number;
  energyRegenPerSec: number;
  pointsMultiplier: number;
  /** Fixed score added per second (from auto_points boosters). Effect amount is interpreted as points/sec. */
  miningPointsPerSec: number;
}

export interface BoosterRow {
  id: string;
  type: string;
  orderIndex: number;
  name: string;
  emoji: string;
  effectAmount: string;
  basePrice: number;
  priceIncreaseCoefficient: string;
  unlockAfterPrevious: number;
  maxLevel: number;
  levelEffectCoefficient: string;
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
