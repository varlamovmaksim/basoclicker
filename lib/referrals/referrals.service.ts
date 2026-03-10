import { db } from "@/lib/db/client";
import {
  ensureUserHasReferralCode,
  findUserByReferralCode,
  getReferralStatsForUser,
  getUserWithReferralByFid,
  markUserUsedReferralCode,
} from "./referrals.repository";
import { getOrCreateUserByFid, addBalance } from "@/lib/user/user.repository";

const REFERRAL_BONUS = 1000;

export interface ReferralProfile {
  referralCode: string;
  appliedReferralCode: string | null;
  referralsCount: number;
}

export type ApplyReferralReason =
  | "ok"
  | "code_empty"
  | "code_invalid"
  | "code_already_used"
  | "self_referral"
  | "inviter_not_found";

export interface ApplyReferralResult {
  ok: boolean;
  reason?: ApplyReferralReason;
  profile?: ReferralProfile;
}

export async function getReferralProfileForFid(fid: string): Promise<ReferralProfile> {
  const user = await getUserWithReferralByFid(fid);
  if (!user) {
    throw new Error("User not found for referral profile");
  }

  const referralCode = await ensureUserHasReferralCode(user.id);
  const { referralsCount } = await getReferralStatsForUser(user.id);

  return {
    referralCode,
    appliedReferralCode: user.usedReferralCode,
    referralsCount,
  };
}

export async function applyReferralCodeForFid(
  fid: string,
  rawCode: string
): Promise<ApplyReferralResult> {
  const trimmed = (rawCode ?? "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!trimmed) {
    return { ok: false, reason: "code_empty" };
  }

  const user = await getUserWithReferralByFid(fid);
  if (!user) {
    return { ok: false, reason: "code_invalid" };
  }

  if (user.usedReferralCode) {
    return { ok: false, reason: "code_already_used" };
  }

  const inviter = await findUserByReferralCode(trimmed);
  if (!inviter) {
    return { ok: false, reason: "inviter_not_found" };
  }

  if (inviter.id === user.id) {
    return { ok: false, reason: "self_referral" };
  }

  await db.transaction(async (tx) => {
    const marked = await markUserUsedReferralCode(user.id, trimmed, tx);
    if (!marked) {
      // Someone else managed to set usedReferralCode concurrently.
      throw new Error("Referral already applied");
    }
    await addBalance(inviter.id, REFERRAL_BONUS, tx);
  });

  const referralCode = await ensureUserHasReferralCode(user.id);
  const { referralsCount } = await getReferralStatsForUser(user.id);

  return {
    ok: true,
    reason: "ok",
    profile: {
      referralCode,
      appliedReferralCode: trimmed,
      referralsCount,
    },
  };
}

/**
 * Called on first auth/session creation when a referral code is present in the request.
 * Ensures the user exists (creating if necessary) and then applies the referral code.
 * Errors are swallowed so they don't break auth; caller can ignore the result.
 */
export async function applyReferralCodeOnAuth(
  auth: { fid: string; username?: string | null; displayName?: string | null },
  rawCode: string
): Promise<void> {
  // Ensure user exists (creates if needed) so later referral stats work consistently.
  await getOrCreateUserByFid(auth.fid, {
    username: auth.username,
    displayName: auth.displayName,
  });

  try {
    await applyReferralCodeForFid(auth.fid, rawCode);
  } catch {
    // Intentionally ignore errors here; auth flow must not break on referral issues.
  }
}

