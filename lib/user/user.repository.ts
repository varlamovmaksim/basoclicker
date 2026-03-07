import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users as usersTable } from "@/lib/db/schema";
import { tapConfig } from "@/lib/tap/config";

/** Accepts either the default db or a transaction client from db.transaction(). */
export type DbClient = typeof db;
export function withClient(client?: DbClient | unknown): DbClient {
  return (client ?? db) as DbClient;
}

export interface UserRow {
  id: string;
  fid: string;
  balance: number;
  energy: number;
  lastEnergyAt: Date | null;
  lastCommitAt: Date | null;
  lastSeq: number;
  avgTps: number | null;
  walletAddress: string | null;
  createdAt: Date;
}

function mapUserRow(row: {
  id: string;
  fid: string;
  balance: unknown;
  energy: unknown;
  lastEnergyAt: Date | null;
  lastCommitAt: Date | null;
  lastSeq: unknown;
  avgTps: unknown;
  walletAddress: string | null;
  createdAt: Date;
}): UserRow {
  return {
    id: row.id,
    fid: row.fid,
    balance: row.balance as number,
    energy: row.energy as number,
    lastEnergyAt: row.lastEnergyAt,
    lastCommitAt: row.lastCommitAt,
    lastSeq: row.lastSeq as number,
    avgTps: row.avgTps as number | null,
    walletAddress: row.walletAddress ?? null,
    createdAt: row.createdAt,
  };
}

export async function getUserByFid(
  fid: string,
  client?: DbClient | unknown
): Promise<UserRow | null> {
  const c = withClient(client);
  const rows = await c
    .select()
    .from(usersTable)
    .where(eq(usersTable.fid, fid))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return mapUserRow(row);
}

export async function getOrCreateUserByFid(fid: string): Promise<UserRow> {
  const existing = await getUserByFid(fid);
  if (existing) return existing;
  const now = new Date();
  const inserted = await db
    .insert(usersTable)
    .values({
      fid,
      energy: tapConfig.ENERGY_MAX,
      lastEnergyAt: now,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("Failed to create user");
  return mapUserRow(row);
}

/** Lock and fetch user row in one round-trip (SELECT ... FOR UPDATE). */
export async function getUserByIdForUpdate(
  id: string,
  client?: DbClient | unknown
): Promise<UserRow | null> {
  const c = withClient(client);
  const rows = await c
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1)
    .for("update");
  const row = rows[0];
  if (!row) return null;
  return mapUserRow(row);
}

export async function getUserById(
  id: string,
  client?: DbClient | unknown
): Promise<UserRow | null> {
  const c = withClient(client);
  const rows = await c
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return mapUserRow(row);
}

export async function setUserEnergy(
  userId: string,
  energy: number,
  lastEnergyAt: Date,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  await c
    .update(usersTable)
    .set({
      energy,
      lastEnergyAt,
    })
    .where(eq(usersTable.id, userId));
}

export async function updateUserAfterCommit(
  userId: string,
  balanceDelta: number,
  energySet: number,
  lastCommitAt: Date,
  lastEnergyAt: Date,
  lastSeq: number,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  await c
    .update(usersTable)
    .set({
      balance: sql`${usersTable.balance} + ${balanceDelta}`,
      energy: energySet,
      lastCommitAt,
      lastEnergyAt,
      lastSeq,
    })
    .where(eq(usersTable.id, userId));
}

/** Update only balance and last_commit_at (e.g. after idle mining grant). */
export async function updateUserAfterIdleMining(
  userId: string,
  balanceDelta: number,
  lastCommitAt: Date,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  await c
    .update(usersTable)
    .set({
      balance: sql`${usersTable.balance} + ${balanceDelta}`,
      lastCommitAt,
    })
    .where(eq(usersTable.id, userId));
}

/** Deduct balance. Returns new balance on success, null if insufficient. Used by boosters. */
export async function deductBalance(
  userId: string,
  amount: number,
  client?: DbClient | unknown
): Promise<number | null> {
  const c = withClient(client);
  const updated = await c
    .update(usersTable)
    .set({ balance: sql`${usersTable.balance} - ${amount}` })
    .where(and(eq(usersTable.id, userId), sql`${usersTable.balance} >= ${amount}`))
    .returning({ balance: usersTable.balance });
  const row = updated[0];
  return row ? (row.balance as number) : null;
}

/** Add balance. Returns new balance. Used by daily-claim. */
export async function addBalance(
  userId: string,
  amount: number,
  client?: DbClient | unknown
): Promise<number> {
  const c = withClient(client);
  const updated = await c
    .update(usersTable)
    .set({ balance: sql`${usersTable.balance} + ${amount}` })
    .where(eq(usersTable.id, userId))
    .returning({ balance: usersTable.balance });
  const row = updated[0];
  return (row?.balance as number) ?? 0;
}

/** Set wallet address only if currently null. Returns the effective wallet (set or existing). */
export async function setWalletIfMissing(
  userId: string,
  walletAddress: string,
  client?: DbClient | unknown
): Promise<string> {
  const c = withClient(client);
  const updated = await c
    .update(usersTable)
    .set({ walletAddress })
    .where(and(eq(usersTable.id, userId), sql`${usersTable.walletAddress} IS NULL`))
    .returning({ walletAddress: usersTable.walletAddress });
  const row = updated[0];
  if (row?.walletAddress) return row.walletAddress as string;
  const current = await c
    .select({ walletAddress: usersTable.walletAddress })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const existing = current[0]?.walletAddress ?? null;
  return existing ?? walletAddress;
}
