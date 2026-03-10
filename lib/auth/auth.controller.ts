import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAppToken, verifyAppToken, type AppJwtPayload } from "./app-jwt";
import type { AuthenticatedUser } from "./auth.types";

/** Deterministic address from device fingerprint (dev only). Same seed -> same address. */
function deriveDevAddress(fingerprint: string): string {
  const hash = createHash("sha256").update(fingerprint).digest();
  return `0x${hash.subarray(0, 20).toString("hex")}`;
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
const DEV_AUTH_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Extract auth user from request. Accepts our app JWT or dev token. Returns null if missing/invalid. */
export async function getAuthFromRequest(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  if (IS_DEV && token === "dev") {
    const fp = request.headers.get("X-Device-Fingerprint");
    return { address: fp ? deriveDevAddress(fp) : DEV_AUTH_ADDRESS };
  }
  if (isAppToken(token)) {
    try {
      const payload = verifyAppToken(token) as AppJwtPayload;
      return { address: String(payload.sub) };
    } catch {
      return null;
    }
  }
  return null;
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
    const address = fp ? deriveDevAddress(fp) : DEV_AUTH_ADDRESS;
    return NextResponse.json({
      success: true,
      user: { address, issuedAt: undefined, expiresAt: undefined },
    });
  }

  if (isAppToken(token)) {
    try {
      const payload = verifyAppToken(token) as AppJwtPayload;
      return NextResponse.json({
        success: true,
        user: {
          address: String(payload.sub),
          issuedAt: payload.iat,
          expiresAt: payload.exp,
        },
      });
    } catch {
      return NextResponse.json({ message: "Invalid or expired token" }, { status: 401 });
    }
  }

  return NextResponse.json({ message: "Invalid token" }, { status: 401 });
}
