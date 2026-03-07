import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyClaims } from "@/lib/db/schema";
import type { DbClient } from "@/lib/user/user.repository";
import {
  addBalance,
  getUserByFid,
  withClient,
} from "@/lib/user/user.repository";

export type { DbClient };

/** Accepts either the default db or a transaction client from db.transaction(). */
function withDbClient(client?: DbClient | unknown): DbClient {
  return withClient(client);
}

export interface DailyClaimUserRow {
  id: string;
  fid: string;
  walletAddress: string | null;
  balance: number;
}

/**
 * Run a function inside a DB transaction. Use from daily-claim.service so the service
 * does not touch db directly.
 */
export async function runInTransaction<T>(
  fn: (tx: unknown) => Promise<T>
): Promise<T> {
  return db.transaction((tx) => fn(tx));
}

export async function getUserForDailyClaimByFid(
  fid: string,
  client?: DbClient | unknown
): Promise<DailyClaimUserRow | null> {
  const user = await getUserByFid(fid, client);
  if (!user) return null;
  return {
    id: user.id,
    fid: user.fid,
    walletAddress: user.walletAddress,
    balance: user.balance,
  };
}

export async function hasDailyClaimWithTxHash(
  txHash: string,
  chainId: number,
  client?: DbClient | unknown
): Promise<boolean> {
  const c = withDbClient(client);
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
  const c = withDbClient(client);
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
  const c = withDbClient(client);
  await c.insert(dailyClaims).values({
    userId,
    txHash,
    chainId,
    claimedAt,
  });
  const balance = await addBalance(userId, points, c);
  return { balance };
}
