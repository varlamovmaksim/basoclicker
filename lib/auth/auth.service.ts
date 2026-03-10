import { verifyToken } from "./auth.repository";
import type { AuthenticatedUser } from "./auth.types";

/**
 * Returns the authenticated user for the given token and domain.
 * Throws on invalid or missing token (caller maps to HTTP).
 */
export async function getAuthenticatedUser(
  token: string,
  domain: string
): Promise<AuthenticatedUser> {
  const payload = await verifyToken(token, domain);
  return {
    address: String(payload.sub),
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}
