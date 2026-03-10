import { NextRequest, NextResponse } from "next/server";

const API_PATH_PREFIX = "/api/";

/** Возвращает origin из NEXT_PUBLIC_URL и вариант с www (или без www). */
function envAllowedOrigins(): string[] {
  const envUrl = process.env.NEXT_PUBLIC_URL;
  if (!envUrl) return [];
  try {
    const u = new URL(envUrl);
    const origins = [u.origin];
    if (u.hostname.startsWith("www.")) {
      origins.push(`${u.protocol}//${u.hostname.slice(4)}`);
    } else if (!u.hostname.includes("localhost") && !u.hostname.endsWith(".vercel.app")) {
      origins.push(`${u.protocol}//www.${u.hostname}`);
    }
    return origins;
  } catch {
    return [];
  }
}

/**
 * Строгий allow-list origin'ов для CORS.
 * В проде обязательно задать NEXT_PUBLIC_URL = homeUrl миниапа (как в farcaster.config), чтобы origin iframe совпадал.
 * Учитываются оба варианта: с www и без.
 */
function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const envOrigins = envAllowedOrigins();

  if (origin) {
    try {
      const o = new URL(origin);
      if (envOrigins.includes(o.origin)) return origin;
      if (host && o.host === host) return origin;
      if (o.hostname === "localhost" || o.hostname.endsWith(".vercel.app")) return origin;
    } catch {
      // ignore invalid URLs
    }
    return null;
  }

  // Нет Origin (same-origin или не браузер) — разрешаем по host/env
  if (envOrigins.length > 0) return envOrigins[0];
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto === "https" ? "https" : "http"}://${host}`;
  }
  return null;
}

function corsHeaders(request: NextRequest): Headers {
  const h = new Headers();
  const allowOrigin = getAllowedOrigin(request);
  if (allowOrigin) {
    h.set("Access-Control-Allow-Origin", allowOrigin);
  }
  h.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Device-Fingerprint");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

export function middleware(request: NextRequest): NextResponse {
  if (!request.nextUrl.pathname.startsWith(API_PATH_PREFIX)) {
    return NextResponse.next();
  }

  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
