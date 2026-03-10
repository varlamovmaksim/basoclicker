const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeWalletAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!ADDRESS_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}
