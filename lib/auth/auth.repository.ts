import { createHash } from "node:crypto";
import { createClient } from "@farcaster/quick-auth";

const client = createClient();

const JWT_CACHE_MAX = 2000;
const jwtCache = new Map<
  string,
  { sub: string | number; iat?: number; exp?: number }
>();

function cacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getCached(key: string): { sub: string | number; iat?: number; exp?: number } | null {
  const entry = jwtCache.get(key);
  if (!entry) return null;
  if (entry.exp != null && entry.exp < Math.floor(Date.now() / 1000)) {
    jwtCache.delete(key);
    return null;
  }
  return entry;
}

export interface VerifiedPayload {
  sub: string | number;
  iat?: number;
  exp?: number;
}

/**
 * Verifies a JWT with quick-auth. All external I/O (quick-auth) lives here.
 * Results are cached in memory by token hash; cache is bounded and entries expire by JWT exp.
 */
export async function verifyToken(
  token: string,
  domain: string
): Promise<VerifiedPayload> {
  const key = cacheKey(token);
  const cached = getCached(key);
  if (cached) return cached;

  const payload = await client.verifyJwt({ token, domain });
  const value: VerifiedPayload = {
    sub: payload.sub,
    iat: payload.iat,
    exp: payload.exp,
  };
  if (jwtCache.size >= JWT_CACHE_MAX) {
    const firstKey = jwtCache.keys().next().value;
    if (firstKey != null) jwtCache.delete(firstKey);
  }
  jwtCache.set(key, value);
  return value;
}
