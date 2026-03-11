import {
  createDailyClaimAndAddPoints,
  getLastDailyClaimSince,
  getUserForDailyClaimByAddress,
  hasDailyClaimWithTxHash,
  runInTransaction,
} from "./daily-claim.repository";

export interface DailyClaimAuthUser {
  address: string;
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
        | "already_claimed_today"
        | "balance_update_failed";
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

type RpcLog = {
  address: string;
  topics: string[];
  data?: string;
};

type RpcReceipt = {
  transactionHash: string;
  status?: string | null;
  logs?: RpcLog[] | null;
};

/** Selector for recordDaily() — must match TapperVault.recordDaily(). */
const RECORD_DAILY_SELECTOR = "0xd9c65c6c";
/** topic0 for event DailyClaimed(address indexed). Used when tx is a batch (e.g. EIP-5792). */
const DAILY_CLAIMED_TOPIC = "0xeedba3f8eadb1bd70d57e57e5b48dff6945eb6dc462b930fd0175f327821edeb";
const DAILY_CLAIMED_TOPIC_HEX = DAILY_CLAIMED_TOPIC.slice(2).toLowerCase();

function getRpcUrl(): string {
  const url = process.env.BASE_RPC_URL ?? process.env.CHAIN_RPC_URL;
  if (!url) {
    throw new Error("BASE_RPC_URL or CHAIN_RPC_URL must be set for daily claim");
  }
  return url;
}

function getDailyContractAddress(): string {
  const addr = process.env.NEXT_PUBLIC_TAPPER_VAULT_ADDRESS;
  if (!addr) {
    throw new Error("NEXT_PUBLIC_TAPPER_VAULT_ADDRESS must be set for daily claim");
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

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface DailyClaimStatus {
  can_claim_daily: boolean;
  last_claim_at: string | null;
}

export async function getDailyClaimStatus(
  auth: DailyClaimAuthUser,
  chainId: number = DEFAULT_CHAIN_ID
): Promise<DailyClaimStatus | null> {
  const user = await getUserForDailyClaimByAddress(auth.address);
  if (!user) return null;

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);
  const lastClaim = await getLastDailyClaimSince(
    user.id,
    chainId,
    twentyFourHoursAgo
  );

  return {
    can_claim_daily: !lastClaim,
    last_claim_at: lastClaim ? lastClaim.claimedAt.toISOString() : null,
  };
}

export async function verifyAndApplyDailyClaim(
  auth: DailyClaimAuthUser,
  txHashRaw: string,
  chainId: number = DEFAULT_CHAIN_ID
): Promise<DailyClaimResult> {
  const txHash =
    typeof txHashRaw === "string"
      ? txHashRaw.trim().toLowerCase()
      : "";
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
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

  let claimant: string;
  const txTo = (tx.to ?? "").toLowerCase();
  const rawInput = (tx.input ?? "").toLowerCase();
  const input = rawInput.startsWith("0x") ? rawInput : "0x" + rawInput;
  const selectorMatch = input.slice(0, 10) === RECORD_DAILY_SELECTOR;

  if (txTo === contractAddress && selectorMatch) {
    claimant = (tx.from ?? "").toLowerCase();
  } else {
    const logs = (receipt as { logs?: RpcLog[]; log?: RpcLog[] }).logs ??
      (receipt as { log?: RpcLog[] }).log ??
      [];
    const dailyLog = logs.find((log) => {
      const addr = (log.address ?? "").toLowerCase();
      const t0 = ((log.topics?.[0] ?? "").toLowerCase()).replace(/^0x/, "");
      return addr === contractAddress && t0 === DAILY_CLAIMED_TOPIC_HEX;
    });
    if (!dailyLog?.topics?.[1]) {
      return { ok: false, reason: txTo === contractAddress ? "invalid_method" : "invalid_contract" };
    }
    const topic1 = (dailyLog.topics[1] ?? "").toLowerCase().replace(/^0x/, "");
    claimant = ("0x" + topic1.slice(-40)).toLowerCase();
  }

  if (!claimant) {
    return { ok: false, reason: "tx_not_found" };
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const POINTS_PER_CLAIM = 1000;

  return runInTransaction(async (txClient) => {
    const user = await getUserForDailyClaimByAddress(auth.address, txClient);
    if (!user) {
      return { ok: false, reason: "user_not_found" } as DailyClaimResult;
    }

    if (!user.walletAddress || user.walletAddress.toLowerCase() !== claimant) {
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

    const previousBalance = user.balance;
    const { balance } = await createDailyClaimAndAddPoints(
      user.id,
      txHash,
      chainId,
      POINTS_PER_CLAIM,
      now,
      txClient
    );

    // If we added points but balance didn't increase, the update likely failed
    if (balance <= previousBalance && POINTS_PER_CLAIM > 0) {
      return { ok: false, reason: "balance_update_failed" } as DailyClaimResult;
    }

    return { ok: true, balance };
  });
}

