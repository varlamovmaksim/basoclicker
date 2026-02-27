/**
 * Booster effects per level and pricing.
 * Price for next purchase = basePrice * (PRICE_GROWTH_COEFFICIENT ** currentLevel).
 */

/** Price multiplies by this factor each level (e.g. 2 = double every level). */
export const PRICE_GROWTH_COEFFICIENT = 2;

/** Effect per level (linear). */
export const BOOSTER_EFFECTS = {
  /** Points multiplier: 1 + level * POINTS_EFFECT_PER_LEVEL (e.g. 1.25, 1.5, …). */
  POINTS_EFFECT_PER_LEVEL: 0.25,
  /** Energy max: base + level * ENERGY_MAX_PER_LEVEL. */
  ENERGY_MAX_PER_LEVEL: 100,
  /** Energy regen: base + level * ENERGY_REGEN_PER_LEVEL (per minute). */
  ENERGY_REGEN_PER_LEVEL: 0.5,
  /** Auto taps per minute = level * AUTO_TAPS_PER_LEVEL. */
  AUTO_TAPS_PER_LEVEL: 5,
} as const;

/** Base price per booster type (cost for first purchase, level 0 → 1). */
export const BOOSTER_BASE_PRICES = {
  POINTS: 100,
  ENERGY_MAX: 150,
  ENERGY_REGEN: 200,
  AUTO_TAPS: 250,
} as const;

export type BoosterType = keyof typeof BOOSTER_BASE_PRICES;

/** Next purchase cost = basePrice * (PRICE_GROWTH_COEFFICIENT ** currentLevel). */
export function getBoosterNextPrice(
  basePrice: number,
  currentLevel: number
): number {
  return Math.floor(basePrice * PRICE_GROWTH_COEFFICIENT ** currentLevel);
}
