import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userFids as userFidsTable, users as usersTable } from "@/lib/db/schema";

export interface LeaderboardEntry {
  rank: number;
  fid: string | null;
  score: number;
  displayName: string | null;
  username: string | null;
  walletAddress: string | null;
}

const TOP_LIMIT = 100;
const HAS_WALLET_ADDRESS = sql`${usersTable.walletAddress} IS NOT NULL AND ${usersTable.walletAddress} <> ''`;

async function getRepresentativeFidsByUserId(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      userId: userFidsTable.userId,
      fid: userFidsTable.fid,
    })
    .from(userFidsTable)
    .where(inArray(userFidsTable.userId, userIds))
    .orderBy(asc(userFidsTable.createdAt), asc(userFidsTable.fid));

  const byUserId = new Map<string, string>();
  for (const row of rows) {
    if (!byUserId.has(row.userId)) {
      byUserId.set(row.userId, row.fid);
    }
  }
  return byUserId;
}

/**
 * Top players by balance (score), ordered descending.
 */
export async function getTopByBalance(
  limit: number = TOP_LIMIT
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      id: usersTable.id,
      balance: usersTable.balance,
      displayName: usersTable.displayName,
      username: usersTable.username,
      walletAddress: usersTable.walletAddress,
    })
    .from(usersTable)
    .where(HAS_WALLET_ADDRESS)
    .orderBy(desc(usersTable.balance))
    .limit(limit);

  const representativeFids = await getRepresentativeFidsByUserId(
    rows.map((row) => row.id)
  );

  return rows.map((r, idx) => ({
    rank: idx + 1,
    fid: representativeFids.get(r.id) ?? null,
    score: r.balance as number,
    displayName: r.displayName ?? null,
    username: r.username ?? null,
    walletAddress: r.walletAddress ?? null,
  }));
}

/**
 * Total number of users shown in leaderboard.
 */
export async function getTotalPlayers(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(HAS_WALLET_ADDRESS);
  return result[0]?.count ?? 0;
}

/**
 * Rank of the user by address (1-based) among users with a wallet address.
 * Returns null if user not found or user has no wallet address.
 * Rank = number of users with strictly greater balance + 1.
 */
export async function getRankByAddress(address: string): Promise<number | null> {
  const user = await db
    .select({
      balance: usersTable.balance,
      walletAddress: usersTable.walletAddress,
    })
    .from(usersTable)
    .where(eq(usersTable.walletAddress, address))
    .limit(1);

  const balance = user[0]?.balance;
  const walletAddress = user[0]?.walletAddress;
  if (balance == null) return null;
  if (!walletAddress) return null;

  const rankResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(sql`${HAS_WALLET_ADDRESS} AND ${usersTable.balance} > ${balance as number}`);
  const above = rankResult[0]?.count ?? 0;
  return above + 1;
}
