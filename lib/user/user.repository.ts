import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userFids as userFidsTable, users as usersTable } from "@/lib/db/schema";
import { tapConfig } from "@/lib/tap/config";
import { normalizeWalletAddress } from "./identity";

/** Accepts either the default db or a transaction client from db.transaction(). */
export type DbClient = typeof db;
export function withClient(client?: DbClient | unknown): DbClient {
  return (client ?? db) as DbClient;
}

export interface UserRow {
  id: string;
  username: string | null;
  displayName: string | null;
  balance: number;
  energy: number;
  lastEnergyAt: Date | null;
  lastCommitAt: Date | null;
  lastSeq: number;
  avgTps: number | null;
  walletAddress: string | null;
  createdAt: Date;
}

export interface UserProfileInput {
  username?: string | null;
  displayName?: string | null;
}

function mapUserRow(row: {
  id: string;
  username: string | null;
  displayName: string | null;
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
    username: row.username ?? null,
    displayName: row.displayName ?? null,
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

function getNormalizedAddressOrThrow(address: string): string {
  const normalized = normalizeWalletAddress(address);
  if (!normalized) {
    throw new Error("Invalid wallet address");
  }
  return normalized;
}

export async function getUserByAddress(
  address: string,
  client?: DbClient | unknown
): Promise<UserRow | null> {
  const normalizedAddress = normalizeWalletAddress(address);
  if (!normalizedAddress) return null;
  const c = withClient(client);
  const rows = await c
    .select()
    .from(usersTable)
    .where(eq(usersTable.walletAddress, normalizedAddress))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return mapUserRow(row);
}

export async function getOrCreateUserByAddress(
  address: string,
  profile?: UserProfileInput | null
): Promise<UserRow> {
  const normalizedAddress = getNormalizedAddressOrThrow(address);
  const existing = await getUserByAddress(normalizedAddress);
  if (existing) {
    if (
      profile &&
      (profile.username !== undefined || profile.displayName !== undefined)
    ) {
      await updateUserProfile(existing.id, profile);
      return (await getUserByAddress(normalizedAddress)) ?? existing;
    }
    return existing;
  }
  const now = new Date();
  const inserted = await db
    .insert(usersTable)
    .values({
      walletAddress: normalizedAddress,
      username: profile?.username ?? null,
      displayName: profile?.displayName ?? null,
      energy: tapConfig.ENERGY_MAX,
      lastEnergyAt: now,
    })
    .onConflictDoNothing({ target: usersTable.walletAddress })
    .returning();
  const row = inserted[0];
  if (row) return mapUserRow(row);

  const created = await getUserByAddress(normalizedAddress);
  if (!created) throw new Error("Failed to create user");

  if (
    profile &&
    (profile.username !== undefined || profile.displayName !== undefined)
  ) {
    await updateUserProfile(created.id, profile);
    return (await getUserByAddress(normalizedAddress)) ?? created;
  }

  return created;
}

export async function attachFidToUser(
  userId: string,
  fid: string,
  client?: DbClient | unknown
): Promise<void> {
  const normalizedFid = fid.trim();
  if (!/^\d+$/.test(normalizedFid)) return;

  const c = withClient(client);
  await c
    .insert(userFidsTable)
    .values({
      userId,
      fid: normalizedFid,
    })
    .onConflictDoNothing({ target: userFidsTable.fid });
}

/** Update username and/or display_name from miniapp context. */
export async function updateUserProfile(
  userId: string,
  profile: UserProfileInput,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  const updates: { username?: string | null; displayName?: string | null } =
    {};
  if (profile.username !== undefined) updates.username = profile.username ?? null;
  if (profile.displayName !== undefined)
    updates.displayName = profile.displayName ?? null;
  if (Object.keys(updates).length === 0) return;
  await c.update(usersTable).set(updates).where(eq(usersTable.id, userId));
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

