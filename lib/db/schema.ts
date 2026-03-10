import {
  bigint,
  decimal,
  index,
  integer,
  primaryKey,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 128 }),
  displayName: varchar("display_name", { length: 128 }),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  energy: bigint("energy", { mode: "number" }).notNull().default(1000),
  lastEnergyAt: timestamp("last_energy_at", { withTimezone: true }),
  lastCommitAt: timestamp("last_commit_at", { withTimezone: true }),
  lastSeq: bigint("last_seq", { mode: "number" }).notNull().default(0),
  avgTps: bigint("avg_tps", { mode: "number" }),
  walletAddress: varchar("wallet_address", { length: 42 }).unique(),
  referralCode: varchar("referral_code", { length: 16 }),
  usedReferralCode: varchar("used_referral_code", { length: 16 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("users_referral_code_unique").on(table.referralCode),
]);

export const userFids = pgTable(
  "user_fids",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fid: varchar("fid", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.fid] }),
    uniqueIndex("user_fids_fid_unique").on(table.fid),
    index("user_fids_user_id_idx").on(table.userId),
  ]
);

export const boosters = pgTable(
  "boosters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 64 }).notNull(),
    orderIndex: integer("order_index").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    effectAmount: decimal("effect_amount", { precision: 10, scale: 4 }).notNull(),
    basePrice: bigint("base_price", { mode: "number" }).notNull(),
    priceIncreaseCoefficient: decimal("price_increase_coefficient", {
      precision: 10,
      scale: 4,
    }).notNull(),
    unlockAfterPrevious: integer("unlock_after_previous").notNull().default(0),
    maxLevel: integer("max_level").notNull().default(20),
    levelEffectCoefficient: decimal("level_effect_coefficient", {
      precision: 10,
      scale: 4,
    })
      .notNull()
      .default("1"),
  },
  (table) => [uniqueIndex("boosters_type_order_index_unique").on(table.type, table.orderIndex)]
);

export const userBoosterPurchases = pgTable(
  "user_booster_purchases",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    boosterId: uuid("booster_id")
      .notNull()
      .references(() => boosters.id, { onDelete: "cascade" }),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.boosterId] })]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deviceFingerprint: varchar("device_fingerprint", { length: 128 }),
    commitCount: bigint("commit_count", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    index("sessions_user_id_started_at_idx").on(table.userId, table.startedAt),
  ]
);

export const dailyClaims = pgTable(
  "daily_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    txHash: varchar("tx_hash", { length: 66 }).notNull(),
    chainId: integer("chain_id").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("daily_claims_tx_hash_chain_id_unique").on(
      table.txHash,
      table.chainId
    ),
    index("daily_claims_user_id_chain_id_claimed_at_idx").on(
      table.userId,
      table.chainId,
      table.claimedAt
    ),
  ]
);

