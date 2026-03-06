import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  sessions as sessionsTable,
  users as usersTable,
} from "@/lib/db/schema";
import { tapConfig } from "./config";

/** Accepts either the default db or a transaction client from db.transaction(). */
type DbClient = typeof db;
function withClient(client?: DbClient | unknown): DbClient {
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
  createdAt: Date;
}

export interface SessionRow {
  id: string;
  userId: string;
  startedAt: Date;
  deviceFingerprint: string | null;
  commitCount: number;
}

export async function getUserByFid(fid: string): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.fid, fid))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return mapUserRow(row);
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
    createdAt: row.createdAt,
  };
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

/** Lock the user row for update (SELECT FOR UPDATE). Call at start of transaction to serialize concurrent startSession/getFullState so idle mining is not applied twice. */
export async function lockUserRowForUpdate(
  userId: string,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  await c.execute(
    sql`SELECT 1 FROM ${usersTable} WHERE ${usersTable.id} = ${userId} FOR UPDATE`
  );
}

/** Lock and fetch user row in one round-trip (SELECT ... FOR UPDATE). Use at start of transaction instead of lockUserRowForUpdate + getUserById. */
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

export async function getSessionByIdAndUserId(
  sessionId: string,
  userId: string
): Promise<SessionRow | null> {
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt,
    deviceFingerprint: row.deviceFingerprint,
    commitCount: row.commitCount as number,
  };
}

/** Get session by id only (caller checks userId). Used for parallel load with getUserByFid. */
export async function getSessionById(
  sessionId: string,
  client?: DbClient | unknown
): Promise<SessionRow | null> {
  const c = withClient(client);
  const rows = await c
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt,
    deviceFingerprint: row.deviceFingerprint,
    commitCount: row.commitCount as number,
  };
}

export async function getLatestSessionByUserId(
  userId: string,
  client?: DbClient | unknown
): Promise<SessionRow | null> {
  const c = withClient(client);
  const rows = await c
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.startedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt,
    deviceFingerprint: row.deviceFingerprint,
    commitCount: row.commitCount as number,
  };
}

export async function createSession(
  userId: string,
  deviceFingerprint?: string | null,
  client?: DbClient | unknown
): Promise<SessionRow> {
  const c = withClient(client);
  const inserted = await c
    .insert(sessionsTable)
    .values({
      userId,
      deviceFingerprint: deviceFingerprint ?? null,
    })
    .returning({
      id: sessionsTable.id,
      userId: sessionsTable.userId,
      startedAt: sessionsTable.startedAt,
      deviceFingerprint: sessionsTable.deviceFingerprint,
      commitCount: sessionsTable.commitCount,
    });
  const row = inserted[0];
  if (!row) throw new Error("Failed to create session");
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt,
    deviceFingerprint: row.deviceFingerprint,
    commitCount: row.commitCount as number,
  };
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

/** Update only balance and last_commit_at (e.g. after idle mining grant). Does not change energy or last_seq. */
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

export async function incrementSessionCommitCount(
  sessionId: string,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  await c
    .update(sessionsTable)
    .set({
      commitCount: sql`${sessionsTable.commitCount} + 1`,
    })
    .where(eq(sessionsTable.id, sessionId));
}

