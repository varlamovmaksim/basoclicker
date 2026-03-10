import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export type ReferralsDbClient = typeof db;

function withClient(client?: ReferralsDbClient | unknown): ReferralsDbClient {
  return (client ?? db) as ReferralsDbClient;
}

export interface UserWithReferralRow {
  id: string;
  fid: string;
  referralCode: string | null;
  usedReferralCode: string | null;
}

export async function getUserWithReferralByFid(
  fid: string,
  client?: ReferralsDbClient | unknown
): Promise<UserWithReferralRow | null> {
  const c = withClient(client);
  const rows = await c
    .select({
      id: users.id,
      fid: users.fid,
      referralCode: users.referralCode,
      usedReferralCode: users.usedReferralCode,
    })
    .from(users)
    .where(eq(users.fid, fid))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row;
}

export async function ensureUserHasReferralCode(
  userId: string,
  client?: ReferralsDbClient | unknown
): Promise<string> {
  const c = withClient(client);

  // Try to read existing code first.
  const existing = await c
    .select({ referralCode: users.referralCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const current = existing[0]?.referralCode ?? null;
  if (current && current.length >= 4) return current;

  // Generate and set new code, retrying on unique conflicts.
  // Pattern is aligned with current mock: BASO + 5 chars.
  // Collision probability is negligible, but we still loop on conflict.
  for (;;) {
    const candidate =
      "BASO" +
      Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    const updated = await c
      .update(users)
      .set({ referralCode: candidate })
      .where(and(eq(users.id, userId), isNull(users.referralCode)))
      .returning({ referralCode: users.referralCode });

    const row = updated[0];
    if (row?.referralCode) return row.referralCode as string;

    // If nothing was updated, someone else might have set a code concurrently;
    // read it and return if present, otherwise try another candidate.
    const reread = await c
      .select({ referralCode: users.referralCode })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const rereadCode = reread[0]?.referralCode ?? null;
    if (rereadCode && rereadCode.length >= 4) return rereadCode;
  }
}

export async function findUserByReferralCode(
  code: string,
  client?: ReferralsDbClient | unknown
): Promise<UserWithReferralRow | null> {
  const c = withClient(client);
  const rows = await c
    .select({
      id: users.id,
      fid: users.fid,
      referralCode: users.referralCode,
      usedReferralCode: users.usedReferralCode,
    })
    .from(users)
    .where(eq(users.referralCode, code))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row;
}

export async function markUserUsedReferralCode(
  userId: string,
  code: string,
  client?: ReferralsDbClient | unknown
): Promise<boolean> {
  const c = withClient(client);
  const updated = await c
    .update(users)
    .set({ usedReferralCode: code })
    .where(and(eq(users.id, userId), isNull(users.usedReferralCode)))
    .returning({ usedReferralCode: users.usedReferralCode });
  const row = updated[0];
  return !!row?.usedReferralCode;
}

export async function getReferralStatsForUser(
  userId: string,
  client?: ReferralsDbClient | unknown
): Promise<{ referralsCount: number }> {
  const c = withClient(client);

  const own = await c
    .select({ referralCode: users.referralCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const code = own[0]?.referralCode ?? null;
  if (!code) return { referralsCount: 0 };

  const rows = await c
    .select({ cnt: count() })
    .from(users)
    .where(eq(users.usedReferralCode, code));
  const cnt = rows[0]?.cnt ?? 0;
  return { referralsCount: Number(cnt) };
}

