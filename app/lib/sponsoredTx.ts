"use client";

/**
 * Base sponsored transactions via EIP-5792 wallet_sendCalls + ERC-7677 paymasterService.
 * When NEXT_PUBLIC_BASE_PAYMASTER_SERVICE_URL is set and the wallet supports it,
 * transactions are gasless (sponsored by the paymaster).
 */

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = "0x2105";

export function getPaymasterServiceUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_BASE_PAYMASTER_SERVICE_URL;
  if (!url || typeof url !== "string" || !url.startsWith("http")) return null;
  return url;
}

export interface SendCallsCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

type EIP1193Request = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

/**
 * Send batched calls with paymaster sponsorship (gasless on Base).
 * Returns bundle id for status polling. Throws if wallet or paymaster rejects.
 */
export async function sendSponsoredCalls(
  request: EIP1193Request,
  from: `0x${string}`,
  chainId: number,
  calls: SendCallsCall[],
  paymasterUrl: string
): Promise<{ id: string }> {
  const chainIdHex = chainId === BASE_CHAIN_ID ? BASE_CHAIN_ID_HEX : `0x${chainId.toString(16)}`;
  const result = (await request({
    method: "wallet_sendCalls",
    params: [
      {
        version: "1.0",
        chainId: chainIdHex,
        from,
        calls: calls.map((c) => ({
          to: c.to,
          data: c.data,
          ...(c.value != null && c.value > BigInt(0) ? { value: `0x${c.value.toString(16)}` } : {}),
        })),
        capabilities: {
          paymasterService: {
            url: paymasterUrl,
          },
        },
      },
    ],
  })) as { id?: string };

  if (!result?.id || typeof result.id !== "string") {
    throw new Error("wallet_sendCalls did not return bundle id");
  }
  return { id: result.id };
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
  const chainIdHex = chainId === BASE_CHAIN_ID ? BASE_CHAIN_ID_HEX : `0x${chainId.toString(16)}`;

  for (let i = 0; i < maxAttempts; i++) {
    const status = (await request({
      method: "wallet_getCallsStatus",
      params: [chainIdHex, [bundleId]],
    })) as {
      status?: number;
      receipts?: Array<{ transactionHash?: string }>;
    }[];

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
