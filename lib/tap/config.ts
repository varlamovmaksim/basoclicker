/**
 * Tap energy config. All values can be overridden via env.
 * ENERGY_MAX: max energy per player; default 1000.
 * ENERGY_REGEN_PER_SEC: energy restored per second; default 1/60 (~same as 1/min).
 */
function envNum(key: string, defaultVal: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultVal;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}

export const tapConfig = {
  ENERGY_MAX: envNum("TAP_ENERGY_MAX", 1000),
  ENERGY_REGEN_PER_SEC: envNum("TAP_ENERGY_REGEN_PER_SEC", 1 / 60),
} as const;
