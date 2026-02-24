import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  sessions as sessionsTable,
  tapCommits,
  users as usersTable,
} from "@/lib/db/schema";
import type { AbuseLevel } from "./types";

/** Accepts either the default db or a transaction client from db.transaction(). */
type DbClient = typeof db;
function withClient(client?: DbClient | unknown): DbClient {
  return (client ?? db) as DbClient;
}

export interface UserRow {
  id: string;
  fid: string;
  balance: number;
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
  return {
    id: row.id,
    fid: row.fid,
    balance: row.balance as number,
    lastCommitAt: row.lastCommitAt,
    lastSeq: row.lastSeq as number,
    avgTps: row.avgTps as number | null,
    createdAt: row.createdAt,
  };
}

export async function getOrCreateUserByFid(fid: string): Promise<UserRow> {
  const existing = await getUserByFid(fid);
  if (existing) return existing;
  const inserted = await db
    .insert(usersTable)
    .values({ fid })
    .returning({
      id: usersTable.id,
      fid: usersTable.fid,
      balance: usersTable.balance,
      lastCommitAt: usersTable.lastCommitAt,
      lastSeq: usersTable.lastSeq,
      avgTps: usersTable.avgTps,
      createdAt: usersTable.createdAt,
    });
  const row = inserted[0];
  if (!row) throw new Error("Failed to create user");
  return {
    id: row.id,
    fid: row.fid,
    balance: row.balance as number,
    lastCommitAt: row.lastCommitAt,
    lastSeq: row.lastSeq as number,
    avgTps: row.avgTps as number | null,
    createdAt: row.createdAt,
  };
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
  return {
    id: row.id,
    fid: row.fid,
    balance: row.balance as number,
    lastCommitAt: row.lastCommitAt,
    lastSeq: row.lastSeq as number,
    avgTps: row.avgTps as number | null,
    createdAt: row.createdAt,
  };
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

export async function getLatestSessionByUserId(
  userId: string
): Promise<SessionRow | null> {
  const rows = await db
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
  deviceFingerprint?: string | null
): Promise<SessionRow> {
  const inserted = await db
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

export interface TapCommitInsert {
  userId: string;
  sessionId: string;
  seq: number;
  requestedTaps: number;
  appliedTaps: number;
  maxAllowed: number;
  ratio: string | null;
  abuseLevel: AbuseLevel | null;
  serverTime: Date;
  clientDurationMs: number | null;
}

export async function insertTapCommit(
  data: TapCommitInsert,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  await c.insert(tapCommits).values({
    userId: data.userId,
    sessionId: data.sessionId,
    seq: data.seq,
    requestedTaps: data.requestedTaps,
    appliedTaps: data.appliedTaps,
    maxAllowed: data.maxAllowed,
    ratio: data.ratio,
    abuseLevel: data.abuseLevel,
    serverTime: data.serverTime,
    clientDurationMs: data.clientDurationMs,
  });
}

export async function updateUserAfterCommit(
  userId: string,
  balanceDelta: number,
  lastCommitAt: Date,
  lastSeq: number,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  await c
    .update(usersTable)
    .set({
      balance: sql`${usersTable.balance} + ${balanceDelta}`,
      lastCommitAt,
      lastSeq,
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
