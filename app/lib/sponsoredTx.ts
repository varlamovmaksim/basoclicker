"use client";

/**
 * Base sponsored transactions via EIP-5792 wallet_sendCalls + ERC-7677 paymasterService.
 * In Base App context the wallet supports paymaster and we use the default Base paymaster URL.
 */

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = "0x2105";

/** Default paymaster URL for Base. */
const DEFAULT_BASE_PAYMASTER_URL = "https://paymaster.base.org/api/v1/sponsor";

/**
 * Returns paymaster service URL for sponsored (gasless) transactions on Base chain.
 */
export function getPaymasterServiceUrl(chainId?: number): string | null {
  if (typeof window === "undefined") return null;
  if (chainId === BASE_CHAIN_ID) return DEFAULT_BASE_PAYMASTER_URL;
  return null;
}

export interface SendCallsCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

type EIP1193Request = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

/**
 * Send batched calls with paymaster sponsorship (gasless on Base).
 * Uses EIP-5792 v2.0.0 (Base requires this version). Returns bundle id for status polling.
 */
export async function sendSponsoredCalls(
  request: EIP1193Request,
  from: `0x${string}`,
  chainId: number,
  calls: SendCallsCall[],
  paymasterUrl: string
): Promise<{ id: string }> {
  const chainIdHex = chainId === BASE_CHAIN_ID ? BASE_CHAIN_ID_HEX : `0x${chainId.toString(16)}`;
  const payload = {
    version: "2.0.0" as const,
    chainId: chainIdHex,
    from,
    atomicRequired: false,
    calls: calls.map((c) => ({
      to: c.to,
      data: c.data,
      value: c.value != null && c.value > BigInt(0) ? `0x${c.value.toString(16)}` : "0x0",
    })),
    capabilities: {
      paymasterService: {
        url: paymasterUrl,
      },
    },
  };

  const result = (await request({
    method: "wallet_sendCalls",
    params: [payload],
  })) as { id?: string; batchId?: string } | string;

  const id = typeof result === "string" ? result : result?.id ?? result?.batchId;
  if (!id || typeof id !== "string") {
    throw new Error("wallet_sendCalls did not return bundle id");
  }
  return { id };
}

/**
 * Poll wallet_getCallsStatus until the bundle is confirmed, then return the first tx hash.
 * Returns null if status indicates failure or no receipt.
 */
export async function getCallsStatusTxHash(
  request: EIP1193Request,
  bundleId: string,
  chainId: number,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<string | null> {
  const maxAttempts = options?.maxAttempts ?? 60;
  const intervalMs = options?.intervalMs ?? 2000;
  void chainId;

  for (let i = 0; i < maxAttempts; i++) {
    const status = (await request({
      method: "wallet_getCallsStatus",
      params: [bundleId],
    })) as
      | { status?: number; receipts?: Array<{ transactionHash?: string }> }
      | Array<{ status?: number; receipts?: Array<{ transactionHash?: string }> }>;

    const item = Array.isArray(status) ? status[0] : status;
    if (!item) continue;

    const st = (item as { status?: number }).status;
    // 2xx = confirmed
    if (typeof st === "number" && st >= 200 && st < 300) {
      const receipts = (item as { receipts?: Array<{ transactionHash?: string }> }).receipts;
      const firstReceipt = Array.isArray(receipts) ? receipts[0] : receipts;
      const hash = firstReceipt?.transactionHash;
      if (hash && typeof hash === "string") return hash;
      return null;
    }
    // 4xx, 5xx, 6xx = failed
    if (typeof st === "number" && st >= 400) return null;

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Check if the wallet supports paymasterService for the given chain (e.g. Base).
 */
export async function walletSupportsPaymaster(
  request: EIP1193Request,
  chainId: number
): Promise<boolean> {
  try {
    const chainIdHex = chainId === BASE_CHAIN_ID ? BASE_CHAIN_ID_HEX : `0x${chainId.toString(16)}`;
    const caps = (await request({
      method: "wallet_getCapabilities",
      params: [chainIdHex],
    })) as Record<string, { paymasterService?: unknown }> | null;
    const chainCaps = caps?.[chainIdHex] ?? caps;
    return Boolean(chainCaps?.paymasterService);
  } catch {
    return false;
  }
}
