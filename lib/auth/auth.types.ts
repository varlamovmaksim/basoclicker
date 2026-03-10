export interface AuthenticatedUser {
  address: string;
  issuedAt?: number;
  expiresAt?: number;
}

export interface SessionIdentityInput {
  address: string;
  fid?: string | null;
  username?: string | null;
  displayName?: string | null;
}
