import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyClaims, users } from "@/lib/db/schema";

/** Accepts either the default db or a transaction client from db.transaction(). */
type DbClient = typeof db;

function withClient(client?: DbClient | unknown): DbClient {
  return (client ?? db) as DbClient;
}

export interface DailyClaimUserRow {
  id: string;
  fid: string;
  walletAddress: string | null;
  balance: number;
}

export async function getUserForDailyClaimByFid(
  fid: string,
  client?: DbClient | unknown
): Promise<DailyClaimUserRow | null> {
  const c = withClient(client);
  const rows = await c
    .select({
      id: users.id,
      fid: users.fid,
      walletAddress: users.walletAddress,
      balance: users.balance,
    })
    .from(users)
    .where(eq(users.fid, fid))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    fid: row.fid,
    walletAddress: row.walletAddress ?? null,
    balance: row.balance as number,
  };
}

export async function setUserWalletIfMissing(
  userId: string,
  walletAddress: string,
  client?: DbClient | unknown
): Promise<string> {
  const c = withClient(client);
  const updated = await c
    .update(users)
    .set({ walletAddress })
    .where(and(eq(users.id, userId), sql`${users.walletAddress} IS NULL`))
    .returning({ walletAddress: users.walletAddress });
  const row = updated[0];
  if (row && row.walletAddress) {
    return row.walletAddress;
  }
  const current = await c
    .select({ walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const existing = current[0]?.walletAddress ?? null;
  return existing ?? walletAddress;
}

export async function hasDailyClaimWithTxHash(
  txHash: string,
  chainId: number,
  client?: DbClient | unknown
): Promise<boolean> {
  const c = withClient(client);
  const rows = await c
    .select({ id: dailyClaims.id })
    .from(dailyClaims)
    .where(
      and(eq(dailyClaims.txHash, txHash), eq(dailyClaims.chainId, chainId))
    )
    .limit(1);
  return !!rows[0];
}

export async function getLastDailyClaimSince(
  userId: string,
  chainId: number,
  since: Date,
  client?: DbClient | unknown
): Promise<{ claimedAt: Date } | null> {
  const c = withClient(client);
  const rows = await c
    .select({ claimedAt: dailyClaims.claimedAt })
    .from(dailyClaims)
    .where(
      and(
        eq(dailyClaims.userId, userId),
        eq(dailyClaims.chainId, chainId),
        gte(dailyClaims.claimedAt, since),
        lt(dailyClaims.claimedAt, new Date())
      )
    )
    .orderBy(desc(dailyClaims.claimedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { claimedAt: row.claimedAt as Date };
}

export async function createDailyClaimAndAddPoints(
  userId: string,
  txHash: string,
  chainId: number,
  points: number,
  claimedAt: Date,
  client?: DbClient | unknown
): Promise<{ balance: number }> {
  const c = withClient(client);
  await c.insert(dailyClaims).values({
    userId,
    txHash,
    chainId,
    claimedAt,
  });
  const updated = await c
    .update(users)
    .set({
      balance: sql`${users.balance} + ${points}`,
    })
    .where(eq(users.id, userId))
    .returning({ balance: users.balance });
  const row = updated[0];
  return { balance: (row?.balance as number) ?? 0 };
}

