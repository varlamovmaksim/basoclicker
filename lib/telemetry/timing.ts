import { NextRequest } from "next/server";

const DEBUG_HEADER = "x-debug-timing";
const DEBUG_QUERY = "timing";

/**
 * Whether to record and log per-request timings (header, query, or development).
 * Use this to avoid logging in production unless explicitly requested.
 */
export function isDebugTimingEnabled(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const header = request.headers.get(DEBUG_HEADER);
  if (header === "1" || header?.toLowerCase() === "true") return true;
  const url = new URL(request.url);
  return url.searchParams.get(DEBUG_QUERY) === "1";
}

/**
 * Measure an async function and return result plus elapsed ms.
 */
export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  return { result, ms };
}

/**
 * Record a duration into a timings object (mutates it).
 */
export function recordTiming(
  timings: Record<string, number>,
  label: string,
  ms: number
): void {
  timings[label] = ms;
}

/**
 * Log timings to console (structured for dev/debug). Only call when timings were collected.
 */
export function logTimings(
  route: string,
  timings: Record<string, number>
): void {
  const entries = Object.entries(timings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}ms`)
    .join(", ");
  console.log(`[timing] ${route} | ${entries}`);
}
