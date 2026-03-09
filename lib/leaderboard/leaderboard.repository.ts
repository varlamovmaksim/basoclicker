import { desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users as usersTable } from "@/lib/db/schema";

export interface LeaderboardEntry {
  rank: number;
  fid: string;
  score: number;
  displayName: string | null;
  username: string | null;
  walletAddress: string | null;
}

const TOP_LIMIT = 100;

/**
 * Top players by balance (score), ordered descending.
 */
export async function getTopByBalance(
  limit: number = TOP_LIMIT
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      fid: usersTable.fid,
      balance: usersTable.balance,
      displayName: usersTable.displayName,
      username: usersTable.username,
      walletAddress: usersTable.walletAddress,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.balance))
    .limit(limit);

  return rows.map((r, idx) => ({
    rank: idx + 1,
    fid: r.fid,
    score: r.balance as number,
    displayName: r.displayName ?? null,
    username: r.username ?? null,
    walletAddress: r.walletAddress ?? null,
  }));
}

/**
 * Total number of users (players).
 */
export async function getTotalPlayers(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);
  return result[0]?.count ?? 0;
}

/**
 * Rank of the user by fid (1-based). Returns null if user not found.
 * Rank = number of users with strictly greater balance + 1.
 */
export async function getRankByFid(fid: string): Promise<number | null> {
  const user = await db
    .select({ balance: usersTable.balance })
    .from(usersTable)
    .where(eq(usersTable.fid, fid))
    .limit(1);

  const balance = user[0]?.balance;
  if (balance == null) return null;

  const rankResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(gt(usersTable.balance, balance as number));
  const above = rankResult[0]?.count ?? 0;
  return above + 1;
}
