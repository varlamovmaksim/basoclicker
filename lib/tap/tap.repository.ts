import { db } from "@/lib/db/client";
import { getStatsAndBoosterList } from "@/lib/boosters/boosters.service";
import {
  getLatestSessionByUserId,
  getSessionById,
} from "@/lib/session/session.repository";
import { getUserByAddress } from "@/lib/user/user.repository";
import type { DbClient } from "@/lib/user/user.repository";
import type { BoosterListItem, EffectiveBoosterStats } from "@/lib/boosters/types";
import type { SessionRow } from "@/lib/session/session.repository";
import type { UserRow } from "@/lib/user/user.repository";

export type { DbClient };

export interface CommitContext {
  user: UserRow;
  session: SessionRow;
  stats: EffectiveBoosterStats;
  list: BoosterListItem[];
}

/** Same shape as CommitContext; session may be null for getFullState. */
export interface StateContext {
  user: UserRow;
  session: SessionRow | null;
  stats: EffectiveBoosterStats;
  list: BoosterListItem[];
}

/**
 * One logical fetch for commit: user by address, session by id, stats and booster list.
 * Returns null if user or session missing or session does not belong to user.
 */
export async function getCommitContext(
  address: string,
  sessionId: string
): Promise<CommitContext | null> {
  const user = await getUserByAddress(address);
  if (!user) return null;
  const [session, statsList] = await Promise.all([
    getSessionById(sessionId),
    getStatsAndBoosterList(user.id),
  ]);
  if (!session || session.userId !== user.id) return null;
  return {
    user,
    session,
    stats: statsList.stats,
    list: statsList.list,
  };
}

/**
 * One logical fetch for getFullState: user by address, latest session, stats and booster list.
 * Returns null if user missing.
 */
export async function getStateContext(address: string): Promise<StateContext | null> {
  const user = await getUserByAddress(address);
  if (!user) return null;
  const [session, statsList] = await Promise.all([
    getLatestSessionByUserId(user.id),
    getStatsAndBoosterList(user.id),
  ]);
  return {
    user,
    session,
    stats: statsList.stats,
    list: statsList.list,
  };
}

/**
 * Run a function inside a DB transaction. Use from tap.service so the service
 * does not touch db directly; pass the client to user.repository and session.repository.
 * The callback receives the transaction client (compatible with DbClient for repo methods).
 */
export async function runInTransaction<T>(
  fn: (tx: unknown) => Promise<T>
): Promise<T> {
  return db.transaction((tx) => fn(tx));
}
