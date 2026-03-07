import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  boosters as boostersTable,
  userBoosterPurchases as userBoosterPurchasesTable,
} from "@/lib/db/schema";
import { deductBalance } from "@/lib/user/user.repository";
import type { BoosterRow } from "./types";

/** Accepts either the default db or a transaction client from db.transaction(). */
type DbClient = typeof db;
function withClient(client?: DbClient | unknown): DbClient {
  return (client ?? db) as DbClient;
}

export async function getBoosters(
  client?: DbClient | unknown
): Promise<BoosterRow[]> {
  const c = withClient(client);
  const rows = await c
    .select()
    .from(boostersTable)
    .orderBy(asc(boostersTable.type), asc(boostersTable.orderIndex));
  return rows.map((row): BoosterRow => ({
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

/**
 * Deduct price from user balance and increment booster purchase count. Atomic.
 * Returns new balance and updated counts on success, null if insufficient balance.
 */
export async function purchaseBooster(
  userId: string,
  boosterId: string,
  price: number,
  client?: DbClient | unknown
): Promise<{ balance: number; counts: Map<string, number> } | null> {
  async function run(
    c: DbClient
  ): Promise<{ balance: number; counts: Map<string, number> } | null> {
    const newBalance = await deductBalance(userId, price, c);
    if (newBalance === null) return null;
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
    return { balance: newBalance, counts };
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
