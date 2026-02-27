export type Skin = { id: string; name: string; stageClass: string };

export type BasoTabKey = "home" | "friends" | "rating" | "shop" | "dev";

export type BasoShopTab = "earn" | "custom";

export interface BasoPersisted {
  skinId: string;
  lastGMDay: string | null;
  referralCode: string;
  referrals: number;
  appliedReferralCode: string | null;
}

