/**
 * Booster price helper. Definitions (base_price, coefficient, effect, etc.) come from DB.
 * Next purchase cost = basePrice * (coefficient ** count).
 */
export function getBoosterNextPrice(
  basePrice: number,
  coefficient: number,
  count: number
): number {
  return Math.floor(basePrice * coefficient ** count);
}
