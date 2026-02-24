import { NextRequest, NextResponse } from "next/server";
import { Errors } from "@farcaster/quick-auth";
import { getAuthenticatedUser } from "./auth.service";

function getUrlHost(request: NextRequest): string {
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

  if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_URL) {
    return new URL(process.env.NEXT_PUBLIC_URL).host;
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`).host;
  }
  return "localhost:3000";
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
