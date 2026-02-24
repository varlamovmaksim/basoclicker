import { createClient } from "@farcaster/quick-auth";

const client = createClient();

export interface VerifiedPayload {
  sub: string | number;
  iat?: number;
  exp?: number;
}

/**
 * Verifies a JWT with quick-auth. All external I/O (quick-auth) lives here.
 */
export async function verifyToken(
  token: string,
  domain: string
): Promise<VerifiedPayload> {
  const payload = await client.verifyJwt({ token, domain });
  return {
    sub: payload.sub,
    iat: payload.iat,
    exp: payload.exp,
  };
}
