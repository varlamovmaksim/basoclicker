import { verifyToken } from "./auth.repository";

export interface AuthUser {
  fid: string;
  issuedAt?: number;
  expiresAt?: number;
}

/**
 * Returns the authenticated user for the given token and domain.
 * Throws on invalid or missing token (caller maps to HTTP).
 */
export async function getAuthenticatedUser(
  token: string,
  domain: string
): Promise<AuthUser> {
  const payload = await verifyToken(token, domain);
  return {
    fid: String(payload.sub),
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}
