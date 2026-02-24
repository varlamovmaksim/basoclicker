/**
 * Tap limits config. All values can be overridden via env.
 * BASE_MAX_TPS: max taps per second (server-time); default 40.
 * MIN_DELTA_T_SEC: minimum seconds between commits; commits with delta_t < this are rejected.
 * FIRST_COMMIT_CAP: max taps allowed on the very first commit (last_commit_at is null).
 */
function envNum(key: string, defaultVal: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return defaultVal;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}

export const tapConfig = {
  BASE_MAX_TPS: envNum("TAP_BASE_MAX_TPS", 40),
  MIN_DELTA_T_SEC: envNum("TAP_MIN_DELTA_T_SEC", 0.5),
  FIRST_COMMIT_CAP: envNum("TAP_FIRST_COMMIT_CAP", 50),
} as const;
