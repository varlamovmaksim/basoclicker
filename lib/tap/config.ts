/**
 * Tap energy config. All values can be overridden via env.
 * ENERGY_MAX: max energy per player; default 1000.
 * ENERGY_REGEN_PER_MIN: energy restored per minute; default 1.
 */
function envNum(key: string, defaultVal: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultVal;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}

export const tapConfig = {
  ENERGY_MAX: envNum("TAP_ENERGY_MAX", 1000),
  ENERGY_REGEN_PER_MIN: envNum("TAP_ENERGY_REGEN_PER_MIN", 1),
} as const;
