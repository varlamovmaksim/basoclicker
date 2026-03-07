import { setWalletIfMissing } from "@/lib/user/user.repository";
import {
  createDailyClaimAndAddPoints,
  getLastDailyClaimSince,
  getUserForDailyClaimByFid,
  hasDailyClaimWithTxHash,
  runInTransaction,
} from "./daily-claim.repository";

export interface DailyClaimAuthUser {
  fid: string;
}

export type DailyClaimResult =
  | { ok: true; balance: number }
  | {
      ok: false;
      reason:
        | "config_error"
        | "invalid_tx_hash"
        | "rpc_error"
        | "tx_not_found"
        | "tx_failed"
        | "invalid_contract"
        | "invalid_method"
        | "user_not_found"
        | "wallet_mismatch"
        | "tx_already_used"
        | "already_claimed_today";
    };

interface RpcRequestBody {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

type RpcTransaction = {
  hash: string;
  from: string;
  to: string | null;
  input: string;
};

type RpcReceipt = {
  transactionHash: string;
  status?: string | null;
};

const RECORD_DAILY_SELECTOR = "0xf49c3a0f";

function getRpcUrl(): string {
  const url = process.env.BASE_RPC_URL ?? process.env.CHAIN_RPC_URL;
  if (!url) {
    throw new Error("BASE_RPC_URL or CHAIN_RPC_URL must be set for daily claim");
  }
  return url;
}

function getDailyContractAddress(): string {
  const addr = process.env.TAPPER_DAILY_CONTRACT_ADDRESS;
  if (!addr) {
    throw new Error("TAPPER_DAILY_CONTRACT_ADDRESS must be set for daily claim");
  }
  return addr.toLowerCase();
}

async function rpcCall<T>(
  method: string,
  params: unknown[]
): Promise<T | null> {
  const url = getRpcUrl();
  const body: RpcRequestBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`RPC HTTP error: ${res.status}`);
  }

  const json = (await res.json()) as RpcResponse<T>;
  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }
  return json.result ?? null;
}

const DEFAULT_CHAIN_ID = 8453; // Base mainnet

export async function verifyAndApplyDailyClaim(
  auth: DailyClaimAuthUser,
  txHash: string,
  chainId: number = DEFAULT_CHAIN_ID
): Promise<DailyClaimResult> {
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: "invalid_tx_hash" };
  }

  let contractAddress: string;
  try {
    contractAddress = getDailyContractAddress();
  } catch {
    return { ok: false, reason: "config_error" };
  }

  let tx: RpcTransaction | null = null;
  let receipt: RpcReceipt | null = null;
  try {
    tx = await rpcCall<RpcTransaction>("eth_getTransactionByHash", [txHash]);
    receipt = await rpcCall<RpcReceipt>("eth_getTransactionReceipt", [txHash]);
  } catch {
    return { ok: false, reason: "rpc_error" };
  }

  if (!tx || !receipt) {
    return { ok: false, reason: "tx_not_found" };
  }

  if (!receipt.status || receipt.status === "0x0") {
    return { ok: false, reason: "tx_failed" };
  }

  if (!tx.to || tx.to.toLowerCase() !== contractAddress) {
    return { ok: false, reason: "invalid_contract" };
  }

  const input = tx.input ?? "";
  if (typeof input !== "string" || !input.startsWith(RECORD_DAILY_SELECTOR)) {
    return { ok: false, reason: "invalid_method" };
  }

  const from = (tx.from ?? "").toLowerCase();
  if (!from) {
    return { ok: false, reason: "tx_not_found" };
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const POINTS_PER_CLAIM = 1000;

  return runInTransaction(async (txClient) => {
    const user = await getUserForDailyClaimByFid(auth.fid, txClient);
    if (!user) {
      return { ok: false, reason: "user_not_found" } as DailyClaimResult;
    }

    const finalWallet =
      user.walletAddress ??
      (await setWalletIfMissing(user.id, from, txClient));

    if (finalWallet && finalWallet.toLowerCase() !== from) {
      return { ok: false, reason: "wallet_mismatch" } as DailyClaimResult;
    }

    const alreadyUsed = await hasDailyClaimWithTxHash(
      txHash,
      chainId,
      txClient
    );
    if (alreadyUsed) {
      return { ok: false, reason: "tx_already_used" } as DailyClaimResult;
    }

    const lastClaim = await getLastDailyClaimSince(
      user.id,
      chainId,
      twentyFourHoursAgo,
      txClient
    );
    if (lastClaim) {
      return { ok: false, reason: "already_claimed_today" } as DailyClaimResult;
    }

    const { balance } = await createDailyClaimAndAddPoints(
      user.id,
      txHash,
      chainId,
      POINTS_PER_CLAIM,
      now,
      txClient
    );

    return { ok: true, balance };
  });
}

