import type { AbuseLevel } from "./types";

export interface AbuseContext {
  userId: string;
  sessionId: string;
  fid?: string;
  requested: number;
  applied: number;
  maxAllowed: number;
  ratio: number;
  seq: number;
  deltaTSeconds: number;
}

/**
 * Compute abuse_level from ratio (requested / maxAllowed).
 * high: ratio > 10; medium: ratio > 5; low: ratio > 1; none otherwise.
 */
export function getAbuseLevel(ratio: number): AbuseLevel {
  if (ratio > 10) return "high";
  if (ratio > 5) return "medium";
  if (ratio > 1) return "low";
  return "none";
}

/**
 * Dedicated abuse handler. Today: only logs. Later: can add throttle, flag, ban, etc.
 */
export function handleAbuse(ctx: AbuseContext): void {
  const level = getAbuseLevel(ctx.ratio);
  // Today: log only. Later: e.g. increment suspicion, persist flag, throttle, ban.
  if (level !== "none") {
    const logLine = [
      `FID:${ctx.fid ?? "?"}`,
      `seq:${ctx.seq}`,
      `delta_t:${ctx.deltaTSeconds.toFixed(2)}s`,
      `requested:${ctx.requested}`,
      `allowed:${ctx.maxAllowed}`,
      `applied:${ctx.applied}`,
      `ratio:${ctx.ratio.toFixed(2)}x`,
      `abuse_level:${level}`,
    ].join(" | ");
    console.warn("[tap abuse]", logLine);
  }
}
