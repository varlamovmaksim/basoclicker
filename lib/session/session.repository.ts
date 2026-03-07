import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions as sessionsTable } from "@/lib/db/schema";
import type { DbClient } from "@/lib/user/user.repository";
import { withClient } from "@/lib/user/user.repository";

export type { DbClient };

/** Result of startSessionWithIdleMiningInDb: session + updated user state + stats (all computed in DB). */
export interface StartSessionWithMiningResult {
  session: SessionRow;
  balance: number;
  lastSeq: number;
  energyAfterRegen: number;
  energyMax: number;
  energyRegenPerSec: number;
  pointsMultiplier: number;
  miningPointsPerSec: number;
  miningPointsApplied: number;
  serverTime: number;
}

export interface SessionRow {
  id: string;
  userId: string;
  startedAt: Date;
  deviceFingerprint: string | null;
  commitCount: number;
}

function mapSessionRow(row: {
  id: string;
  userId: string;
  startedAt: Date;
  deviceFingerprint: string | null;
  commitCount: unknown;
}): SessionRow {
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt,
    deviceFingerprint: row.deviceFingerprint,
    commitCount: row.commitCount as number,
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
  return mapSessionRow(row);
}

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
  return mapSessionRow(row);
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
  return mapSessionRow(row);
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
  return mapSessionRow(row);
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

/**
 * One DB round-trip: UPDATE user (only if last_seq matches) and increment session commit_count.
 * Returns true if both updates ran (seq was valid), false otherwise.
 */
export async function commitUserAndIncrementSession(
  userId: string,
  sessionId: string,
  expectedSeq: number,
  balanceDelta: number,
  newEnergy: number,
  lastCommitAt: Date,
  lastEnergyAt: Date,
  seq: number,
  client?: DbClient | unknown
): Promise<boolean> {
  const c = withClient(client) as {
    execute: (q: ReturnType<typeof sql>) => Promise<unknown[] | { rows: unknown[] }>;
  };
  const lastCommitAtStr = lastCommitAt.toISOString();
  const lastEnergyAtStr = lastEnergyAt.toISOString();
  const raw = await c.execute(sql`
    WITH updated_user AS (
      UPDATE users
      SET balance = balance + ${balanceDelta},
          energy = ${newEnergy},
          last_commit_at = ${lastCommitAtStr}::timestamptz,
          last_energy_at = ${lastEnergyAtStr}::timestamptz,
          last_seq = ${seq}
      WHERE id = ${userId} AND last_seq = ${expectedSeq - 1}
      RETURNING id
    ),
    updated_session AS (
      UPDATE sessions
      SET commit_count = commit_count + 1
      WHERE id = ${sessionId} AND user_id IN (SELECT id FROM updated_user)
      RETURNING id
    )
    SELECT (SELECT id FROM updated_user) AS user_id
  `);
  const rows = Array.isArray(raw) ? raw : (raw as { rows: unknown[] }).rows;
  const row = rows[0] as { user_id: string | null } | undefined;
  return row?.user_id != null;
}

/**
 * One DB round-trip: lock user, compute stats from boosters, compute idle mining,
 * UPDATE user (balance, last_commit_at), INSERT session, return session + state + stats.
 * Config (energy_regen_base, energy_max) must be passed; mining and stats are computed in SQL.
 */
export async function startSessionWithIdleMiningInDb(
  userId: string,
  deviceFingerprint: string | null,
  energyRegenBase: number,
  energyMax: number,
  client?: DbClient | unknown
): Promise<StartSessionWithMiningResult | null> {
  const c = withClient(client) as { execute: (q: ReturnType<typeof sql>) => Promise<unknown[] | { rows: unknown[] }> };
  const raw = await c.execute(sql`
    WITH user_locked AS (
      SELECT id, balance, last_seq, energy, last_energy_at, last_commit_at, created_at
      FROM users WHERE id = ${userId} FOR UPDATE
    ),
    booster_contrib AS (
      SELECT b.type,
        CASE WHEN COALESCE(ubp.count, 0) <= 0 THEN 0
             WHEN b.level_effect_coefficient = 1 THEN COALESCE(ubp.count, 0)::numeric * b.effect_amount
             ELSE b.effect_amount::numeric * (power(b.level_effect_coefficient::numeric, COALESCE(ubp.count, 0)) - 1)
               / NULLIF(b.level_effect_coefficient::numeric - 1, 0)
        END AS contrib
      FROM boosters b
      LEFT JOIN user_booster_purchases ubp ON ubp.booster_id = b.id AND ubp.user_id = ${userId}
    ),
    stats AS (
      SELECT
        ${energyRegenBase}::numeric + COALESCE(SUM(CASE WHEN type = 'energy_regen' THEN contrib END), 0) AS energy_regen_per_sec,
        1 + COALESCE(SUM(CASE WHEN type = 'points_per_tap' THEN contrib END), 0) AS points_multiplier,
        COALESCE(SUM(CASE WHEN type = 'auto_points' THEN contrib END), 0) AS mining_points_per_sec
      FROM booster_contrib
    ),
    mining_calc AS (
      SELECT
        u.id,
        u.balance,
        u.last_seq,
        u.energy,
        u.last_energy_at,
        u.created_at,
        s.energy_regen_per_sec,
        s.points_multiplier,
        s.mining_points_per_sec,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(u.last_commit_at, u.last_energy_at, u.created_at))) * s.mining_points_per_sec)::bigint) AS mining_points
      FROM user_locked u
      CROSS JOIN stats s
    ),
    updated_user AS (
      UPDATE users u
      SET balance = u.balance + mc.mining_points,
          last_commit_at = CASE WHEN mc.mining_points > 0 THEN now() ELSE u.last_commit_at END
      FROM mining_calc mc
      WHERE u.id = mc.id
      RETURNING u.id, u.balance, u.last_seq, u.energy, u.last_energy_at, u.created_at
    ),
    with_stats AS (
      SELECT u.*, mc.energy_regen_per_sec, mc.points_multiplier, mc.mining_points_per_sec, mc.mining_points
      FROM updated_user u
      JOIN mining_calc mc ON mc.id = u.id
    ),
    new_session AS (
      INSERT INTO sessions (user_id, device_fingerprint)
      SELECT id, ${deviceFingerprint} FROM updated_user
      RETURNING id, user_id, started_at, device_fingerprint, commit_count
    )
    SELECT
      ns.id AS session_id,
      ns.user_id AS session_user_id,
      ns.started_at AS session_started_at,
      ns.device_fingerprint AS session_device_fingerprint,
      ns.commit_count AS session_commit_count,
      ws.balance,
      ws.last_seq,
      ws.energy,
      ws.last_energy_at,
      ws.created_at,
      ws.energy_regen_per_sec,
      ws.points_multiplier,
      ws.mining_points_per_sec,
      ws.mining_points AS mining_points_applied,
      ${energyMax}::bigint AS energy_max,
      LEAST(${energyMax}::numeric, ws.energy + LEAST(
        ${energyMax}::numeric - ws.energy,
        FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(ws.last_energy_at, ws.created_at))) * ws.energy_regen_per_sec)::numeric
      )::numeric)::bigint AS energy_after_regen,
      EXTRACT(EPOCH FROM now()) * 1000 AS server_time
    FROM new_session ns
    JOIN with_stats ws ON ws.id = ns.user_id
  `);
  const rows = Array.isArray(raw) ? raw : (raw as { rows: unknown[] }).rows;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const session: SessionRow = {
    id: row.session_id as string,
    userId: row.session_user_id as string,
    startedAt: row.session_started_at as Date,
    deviceFingerprint: row.session_device_fingerprint as string | null,
    commitCount: Number(row.session_commit_count),
  };
  return {
    session,
    balance: Number(row.balance),
    lastSeq: Number(row.last_seq),
    energyAfterRegen: Number(row.energy_after_regen),
    energyMax: Number(row.energy_max),
    energyRegenPerSec: Number(row.energy_regen_per_sec),
    pointsMultiplier: Number(row.points_multiplier),
    miningPointsPerSec: Number(row.mining_points_per_sec),
    miningPointsApplied: Number(row.mining_points_applied),
    serverTime: Math.floor(Number(row.server_time)),
  };
}
