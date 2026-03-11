export type BasoTabKey = "home" | "friends" | "rating" | "shop" | "dev";

export type BasoShopTab = "earn" | "custom";

export interface BasoPersisted {
  lastGMDay: string | null;
  referralCode: string;
  referrals: number;
  appliedReferralCode: string | null;
}

