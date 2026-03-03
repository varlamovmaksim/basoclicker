import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  boosters as boostersTable,
  sessions as sessionsTable,
  tapCommits,
  userBoosterPurchases as userBoosterPurchasesTable,
  users as usersTable,
} from "@/lib/db/schema";
import { tapConfig } from "./config";
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
  energy: number;
  lastEnergyAt: Date | null;
  lastCommitAt: Date | null;
  lastSeq: number;
  avgTps: number | null;
  createdAt: Date;
}

export interface BoosterRow {
  id: string;
  type: string;
  orderIndex: number;
  name: string;
  emoji: string;
  effectAmount: string;
  basePrice: number;
  priceIncreaseCoefficient: string;
  unlockAfterPrevious: number;
  maxLevel: number;
  levelEffectCoefficient: string;
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

export async function getBoosters(
  client?: DbClient | unknown
): Promise<BoosterRow[]> {
  const c = withClient(client);
  const rows = await c
    .select()
    .from(boostersTable)
    .orderBy(asc(boostersTable.type), asc(boostersTable.orderIndex));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    orderIndex: Number(row.orderIndex),
    name: row.name,
    emoji: row.emoji,
    effectAmount: row.effectAmount,
    basePrice: row.basePrice as number,
    priceIncreaseCoefficient: row.priceIncreaseCoefficient,
    unlockAfterPrevious: Number(row.unlockAfterPrevious),
    maxLevel: Number(row.maxLevel),
    levelEffectCoefficient: row.levelEffectCoefficient,
  }));
}

export async function getUserBoosterCounts(
  userId: string,
  client?: DbClient | unknown
): Promise<Map<string, number>> {
  const c = withClient(client);
  const rows = await c
    .select({
      boosterId: userBoosterPurchasesTable.boosterId,
      count: userBoosterPurchasesTable.count,
    })
    .from(userBoosterPurchasesTable)
    .where(eq(userBoosterPurchasesTable.userId, userId));
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.boosterId, row.count);
  }
  return map;
}

export async function purchaseBooster(
  userId: string,
  boosterId: string,
  price: number,
  client?: DbClient | unknown
): Promise<{ user: UserRow; counts: Map<string, number> } | null> {
  async function run(
    c: DbClient
  ): Promise<{ user: UserRow; counts: Map<string, number> } | null> {
    const updated = await c
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} - ${price}` })
      .where(and(eq(usersTable.id, userId), sql`${usersTable.balance} >= ${price}`))
      .returning();
    const userRow = updated[0];
    if (!userRow) return null;
    await c
      .insert(userBoosterPurchasesTable)
      .values({
        userId,
        boosterId,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [
          userBoosterPurchasesTable.userId,
          userBoosterPurchasesTable.boosterId,
        ],
        set: {
          count: sql`${userBoosterPurchasesTable.count} + 1`,
        },
      });
    const counts = await getUserBoosterCounts(userId, c);
    return { user: mapUserRow(userRow), counts };
  }
  if (client) return run(client as DbClient);
  return db.transaction((tx) => run(tx as unknown as DbClient));
}

/**
 * Dev-only: set purchase count for a user and booster.
 */
export async function setUserBoosterCount(
  userId: string,
  boosterId: string,
  count: number,
  client?: DbClient | unknown
): Promise<void> {
  const c = withClient(client);
  const safeCount = Math.max(0, Math.floor(count));
  await c
    .insert(userBoosterPurchasesTable)
    .values({
      userId,
      boosterId,
      count: safeCount,
    })
    .onConflictDoUpdate({
      target: [
        userBoosterPurchasesTable.userId,
        userBoosterPurchasesTable.boosterId,
      ],
      set: { count: safeCount },
    });
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

