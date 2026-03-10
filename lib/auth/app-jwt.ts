import { createHmac } from "node:crypto";

const ALG = "HS256";
const TTL_SEC = 60 * 60 * 24 * 30; // 30 days

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function getSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_JWT_SECRET must be set and at least 16 characters");
  }
  return secret;
}

export interface AppJwtPayload {
  sub: string; // fid
  iat: number;
  exp: number;
}

/**
 * Issue our own JWT for the given fid. Used after session creation (miniapp context or legacy Bearer).
 */
export function issueAppToken(fid: string): string {
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TTL_SEC;
  const header = { alg: ALG, typ: "JWT" };
  const payload: AppJwtPayload = { sub: String(fid), iat, exp };
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signatureInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac("sha256", secret)
    .update(signatureInput)
    .digest();
  return `${signatureInput}.${base64UrlEncode(sig)}`;
}

/**
 * Verify our JWT and return payload. Throws on invalid or expired token.
 */
export function verifyAppToken(token: string): AppJwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [headerB64, payloadB64, sigB64] = parts;
  const secret = getSecret();
  const signatureInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac("sha256", secret)
    .update(signatureInput)
    .digest();
  const expectedB64 = base64UrlEncode(expectedSig);
  if (expectedB64 !== sigB64) throw new Error("Invalid JWT signature");
  const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
  const payload = JSON.parse(payloadJson) as AppJwtPayload;
  if (!payload.sub || typeof payload.exp !== "number") {
    throw new Error("Invalid JWT payload");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("JWT expired");
  return payload;
}

/**
 * Returns true if the token looks like our JWT (three base64url parts). Used to avoid calling Farcaster verify.
 */
export function isAppToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
