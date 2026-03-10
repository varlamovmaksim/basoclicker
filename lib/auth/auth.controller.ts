import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Errors } from "@farcaster/quick-auth";
import { getAuthenticatedUser } from "./auth.service";

/** Deterministic fid from device fingerprint (dev only). Same seed → same fid. */
function deriveDevFid(fingerprint: string): string {
  const hash = createHash("sha256").update(fingerprint).digest();
  const lo = hash.readUInt32BE(0);
  const hi = hash.readUInt32BE(4);
  const n = Number((BigInt(lo) << BigInt(32)) | BigInt(hi)) >>> 0;
  return String(1 + (n % 2147483646));
}

/**
 * Host used for JWT verification. In production, prefer NEXT_PUBLIC_URL so the
 * domain matches the miniapp registration (homeUrl); otherwise quick-auth
 * verification can fail when request origin/host differ (e.g. vercel.app vs custom domain).
 */
export function getUrlHost(request: NextRequest): string {
  if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_URL).host;
    } catch {
      // fall through
    }
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      return url.host;
    } catch {
      // fall through
    }
  }

  const host = request.headers.get("host");
  if (host) return host;

  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`).host;
  }
  return "localhost:3000";
}

const IS_DEV = process.env.NEXT_PUBLIC_IS_DEV === "true";
const DEV_AUTH_FID = "0";

/** Extract auth user (fid) from request. Returns null if missing/invalid token. */
export async function getAuthFromRequest(
  request: NextRequest
): Promise<{ fid: string } | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  if (IS_DEV && token === "dev") {
    const fp = request.headers.get("X-Device-Fingerprint");
    return { fid: fp ? deriveDevFid(fp) : DEV_AUTH_FID };
  }
  const domain = getUrlHost(request);
  try {
    const user = await getAuthenticatedUser(token, domain);
    return { fid: user.fid };
  } catch {
    return null;
  }
}

/**
 * GET /api/auth — validate Authorization header, verify JWT, return user.
 * Controller: parse request, call service, map to HTTP response.
 */
export async function handleGetAuth(
  request: NextRequest
): Promise<NextResponse> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ message: "Missing token" }, { status: 401 });
  }

  const token = authorization.slice(7);
  if (IS_DEV && token === "dev") {
    const fp = request.headers.get("X-Device-Fingerprint");
    const fid = fp ? deriveDevFid(fp) : DEV_AUTH_FID;
    return NextResponse.json({
      success: true,
      user: { fid, issuedAt: undefined, expiresAt: undefined },
    });
  }

  const domain = getUrlHost(request);

  try {
    const user = await getAuthenticatedUser(token, domain);
    return NextResponse.json({
      success: true,
      user: {
        fid: user.fid,
        issuedAt: user.issuedAt,
        expiresAt: user.expiresAt,
      },
    });
  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }
    if (e instanceof Error) {
      return NextResponse.json({ message: e.message }, { status: 500 });
    }
    throw e;
  }
}
